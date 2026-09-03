/**
 * Season-long positional finishes — "he ended the year as RB4".
 *
 * Sleeper's `/stats/nfl/regular/:season` returns raw stat totals keyed exactly
 * like a league's `scoring_settings`, so dotting the two gives each player's
 * season points *under that league's own rules* rather than Sleeper's generic
 * PPR/half-PPR ranks. That matters: a league with first-down and yardage
 * bonuses ranks players differently from a vanilla one.
 *
 * `player_week_roster` deliberately isn't the source here — it only holds
 * players who were rostered in the league that week, so free agents are missing
 * entirely and anyone dropped mid-season is undercounted.
 */
import type { DB } from '../db/index.js'

/** Positions worth ranking. Everything else is noise on a draft board. */
export const RANKED_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const

export interface RankedPlayer {
  playerId: string
  position: string
  points: number
  posRank: number
  games: number | null
}

export interface SeasonRankInput {
  /** playerId → raw Sleeper stat bag for the season. */
  stats: Record<string, Record<string, unknown> | null | undefined>
  /** playerId → position, from the `player` table. */
  positions: Map<string, string | null>
  /** The league's Sleeper `scoring_settings`. */
  scoring: Record<string, number>
}

/**
 * Score every player against one league's scoring settings and rank them within
 * their position. Players who never appeared (`gp` of 0 or absent) are dropped
 * — a rank should mean "finished 4th among RBs who played", not "4th among
 * every RB Sleeper has a row for".
 */
export function rankSeasonScoring(input: SeasonRankInput): RankedPlayer[] {
  const { stats, positions, scoring } = input
  const scored: RankedPlayer[] = []

  for (const [playerId, bag] of Object.entries(stats)) {
    if (!bag) continue
    const position = positions.get(playerId)
    if (!position || !RANKED_POSITIONS.includes(position as (typeof RANKED_POSITIONS)[number])) {
      continue
    }
    const games = typeof bag.gp === 'number' ? bag.gp : null
    if (games != null && games <= 0) continue

    let points = 0
    let matched = false
    for (const [stat, weight] of Object.entries(scoring)) {
      const value = bag[stat]
      if (typeof value !== 'number' || !Number.isFinite(value)) continue
      points += value * weight
      matched = true
    }
    if (!matched) continue

    scored.push({ playerId, position, points: Math.round(points * 100) / 100, posRank: 0, games })
  }

  const byPosition = new Map<string, RankedPlayer[]>()
  for (const p of scored) {
    const list = byPosition.get(p.position) ?? []
    list.push(p)
    byPosition.set(p.position, list)
  }
  for (const list of byPosition.values()) {
    list.sort((a, b) => b.points - a.points || a.playerId.localeCompare(b.playerId))
    list.forEach((p, i) => {
      p.posRank = i + 1
    })
  }

  return scored
}

export interface PositionalFinish {
  posRank: number
  points: number
  position: string
}

/** Stored finishes for one family-season, keyed by player id. */
export function getPositionalFinishes(
  db: DB,
  familyId: number,
  season: number,
): Map<string, PositionalFinish> {
  const rows = db
    .prepare(
      `SELECT player_id, position, points, pos_rank
       FROM player_season_scoring
       WHERE family_id = ? AND season = ?`,
    )
    .all(familyId, season) as Array<{
    player_id: string
    position: string | null
    points: number
    pos_rank: number
  }>

  const out = new Map<string, PositionalFinish>()
  for (const r of rows) {
    if (!r.position) continue
    out.set(r.player_id, { posRank: r.pos_rank, points: r.points, position: r.position })
  }
  return out
}
