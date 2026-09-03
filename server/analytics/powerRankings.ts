/**
 * Power rankings — a blended, schedule-aware strength score for
 * the most recent season with games played.
 *
 * blend = 0.45·recentForm(last 3 wk, z) + 0.30·seasonPPG(z) + 0.25·allPlayWin%
 *
 * Roster strength (KTC/FC values) is intentionally left out for now — it needs
 * a player-value join and only applies to dynasty. Week-over-week movement is
 * computed by re-running the blend as of the previous week.
 */
import type { DB } from '../db/index.js'
import { getFamily } from './queries.js'
import { getAllPlay } from './allplay.js'

export interface PowerRow {
  rank: number
  previousRank: number | null
  movement: number | null
  userId: string
  name: string
  score: number
  recentPpg: number
  seasonPpg: number
  allPlayWinPct: number
  record: string
}

interface Game {
  week: number
  userId: string
  points: number
  result: 'W' | 'L' | 'T'
}

export function getPowerRankings(db: DB, slug: string, season?: number): {
  season: number | null
  throughWeek: number | null
  rankings: PowerRow[]
} {
  const family = getFamily(db, slug)
  if (!family) return { season: null, throughWeek: null, rankings: [] }

  const targetSeason =
    season ??
    (db
      .prepare(
        `SELECT ls.season FROM matchup m JOIN league_season ls ON ls.league_id = m.league_id
         WHERE ls.family_id = ? AND m.result IS NOT NULL
         ORDER BY ls.season DESC LIMIT 1`,
      )
      .get(family.id) as { season: number } | undefined)?.season

  if (targetSeason == null) return { season: null, throughWeek: null, rankings: [] }

  const games = db
    .prepare(
      `SELECT m.week, m.user_id AS userId, m.points, m.result
       FROM matchup m JOIN league_season ls ON ls.league_id = m.league_id
       WHERE ls.family_id = ? AND ls.season = ?
         AND m.result IS NOT NULL AND m.user_id IS NOT NULL AND m.points IS NOT NULL
         AND m.is_playoff = 0 AND m.is_consolation = 0`,
    )
    .all(family.id, targetSeason) as Game[]

  if (games.length === 0) return { season: targetSeason, throughWeek: null, rankings: [] }

  const maxWeek = Math.max(...games.map((g) => g.week))
  if (maxWeek < 2) return { season: targetSeason, throughWeek: maxWeek, rankings: [] }

  const names = new Map<string, string>()
  {
    const stmt = db.prepare(`SELECT display_name, canonical_name FROM manager WHERE user_id = ?`)
    for (const id of new Set(games.map((g) => g.userId))) {
      const m = stmt.get(id) as { display_name: string | null; canonical_name: string | null } | undefined
      names.set(id, m?.canonical_name ?? m?.display_name ?? id)
    }
  }

  const allPlay = new Map(getAllPlay(db, slug, targetSeason).map((r) => [r.userId, r.allPlayWinPct]))

  const rankAsOf = (throughWeek: number): Map<string, number> => {
    const upto = games.filter((g) => g.week <= throughWeek)
    const byUser = new Map<string, Game[]>()
    for (const g of upto) {
      const list = byUser.get(g.userId) ?? []
      list.push(g)
      byUser.set(g.userId, list)
    }

    const seasonPpg = new Map<string, number>()
    const recentPpg = new Map<string, number>()
    for (const [userId, list] of byUser) {
      list.sort((a, b) => a.week - b.week)
      seasonPpg.set(userId, mean(list.map((g) => g.points)))
      recentPpg.set(userId, mean(list.slice(-3).map((g) => g.points)))
    }

    const seasonZ = zScores(seasonPpg)
    const recentZ = zScores(recentPpg)

    const score = new Map<string, number>()
    for (const userId of byUser.keys()) {
      score.set(
        userId,
        0.45 * (recentZ.get(userId) ?? 0) +
          0.3 * (seasonZ.get(userId) ?? 0) +
          0.25 * ((allPlay.get(userId) ?? 0.5) - 0.5) * 4, // scale ~[-2,2]
      )
    }
    const ordered = [...score.entries()].sort((a, b) => b[1] - a[1])
    const ranks = new Map<string, number>()
    ordered.forEach(([userId], i) => ranks.set(userId, i + 1))
    return ranks
  }

  const prevRanks = maxWeek >= 3 ? rankAsOf(maxWeek - 1) : new Map<string, number>()

  // Final blend as of the last week.
  const byUser = new Map<string, Game[]>()
  for (const g of games) {
    const list = byUser.get(g.userId) ?? []
    list.push(g)
    byUser.set(g.userId, list)
  }
  const seasonPpg = new Map<string, number>()
  const recentPpg = new Map<string, number>()
  const record = new Map<string, string>()
  for (const [userId, list] of byUser) {
    list.sort((a, b) => a.week - b.week)
    seasonPpg.set(userId, mean(list.map((g) => g.points)))
    recentPpg.set(userId, mean(list.slice(-3).map((g) => g.points)))
    const w = list.filter((g) => g.result === 'W').length
    const l = list.filter((g) => g.result === 'L').length
    const t = list.filter((g) => g.result === 'T').length
    record.set(userId, t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`)
  }
  const seasonZ = zScores(seasonPpg)
  const recentZ = zScores(recentPpg)

  const scored = [...byUser.keys()].map((userId) => {
    const score =
      0.45 * (recentZ.get(userId) ?? 0) +
      0.3 * (seasonZ.get(userId) ?? 0) +
      0.25 * ((allPlay.get(userId) ?? 0.5) - 0.5) * 4
    return { userId, score }
  })
  scored.sort((a, b) => b.score - a.score)

  const rankings: PowerRow[] = scored.map((s, i) => {
    const previousRank = prevRanks.get(s.userId) ?? null
    return {
      rank: i + 1,
      previousRank,
      movement: previousRank != null ? previousRank - (i + 1) : null,
      userId: s.userId,
      name: names.get(s.userId) ?? s.userId,
      score: Math.round(s.score * 1000) / 1000,
      recentPpg: round2(recentPpg.get(s.userId) ?? 0),
      seasonPpg: round2(seasonPpg.get(s.userId) ?? 0),
      allPlayWinPct: allPlay.get(s.userId) ?? 0,
      record: record.get(s.userId) ?? '0-0',
    }
  })

  return { season: targetSeason, throughWeek: maxWeek, rankings }
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}

function zScores(values: Map<string, number>): Map<string, number> {
  const xs = [...values.values()]
  const m = mean(xs)
  const sd = Math.sqrt(mean(xs.map((x) => (x - m) ** 2))) || 1
  const out = new Map<string, number>()
  for (const [k, v] of values) out.set(k, (v - m) / sd)
  return out
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
