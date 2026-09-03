/**
 * Week-by-week matchups, read out of the ingested `matchup` rows.
 *
 * `matchup` stores one row per team per week, so every game is present twice —
 * once from each side. These functions collapse that back into games, and
 * attach the pair's all-time head-to-head record so a weekly slate reads as
 * "these two, who have met nine times before" rather than as two bare scores.
 */
import type { DB } from '../db/index.js'
import { getFamily } from './queries.js'

export interface MatchupSide {
  userId: string | null
  name: string
  rosterId: number
  teamName: string | null
  points: number
}

export interface MatchupGame {
  matchupId: number | null
  /** Home is whichever side the ingest listed first; it carries no advantage. */
  home: MatchupSide
  away: MatchupSide | null
  isPlayoff: boolean
  isConsolation: boolean
  /**
   * No opponent that week — a playoff first-round bye, or an odd roster count.
   * The team still scores; there is just nothing to win.
   */
  bye: boolean
  /** Decided. A bye is decided as soon as its points are in. */
  final: boolean
  /**
   * The pair's all-time record across every season of this league family,
   * oriented as home-vs-away, excluding consolation games. Null for a bye.
   */
  h2h: { wins: number; losses: number; ties: number; meetings: number } | null
}

export interface WeekView {
  season: number
  week: number
  games: MatchupGame[]
}

export interface SeasonWeeks {
  season: number
  weeks: number[]
  playoffWeekStart: number | null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Which season/week combinations actually have games, for building a picker. */
export function getMatchupWeeks(db: DB, slug: string): SeasonWeeks[] {
  const family = getFamily(db, slug)
  if (!family) return []

  const rows = db
    .prepare(
      `SELECT ls.season, m.week, ls.playoff_week_start
       FROM matchup m JOIN league_season ls ON ls.league_id = m.league_id
       WHERE ls.family_id = ?
       GROUP BY ls.season, m.week
       ORDER BY ls.season DESC, m.week`,
    )
    .all(family.id) as Array<{ season: number; week: number; playoff_week_start: number | null }>

  const bySeason = new Map<number, SeasonWeeks>()
  for (const r of rows) {
    let entry = bySeason.get(r.season)
    if (!entry) {
      entry = { season: r.season, weeks: [], playoffWeekStart: r.playoff_week_start }
      bySeason.set(r.season, entry)
    }
    entry.weeks.push(r.week)
  }
  return [...bySeason.values()]
}

/**
 * All-time head-to-head win/loss counts for every pairing in the family, keyed
 * `a:b` from a's point of view. Built in one pass because a weekly slate needs
 * six of these at once and a query per game would be silly.
 */
function h2hIndex(db: DB, familyId: number): Map<string, { wins: number; losses: number; ties: number }> {
  const rows = db
    .prepare(
      `SELECT m.user_id, m.opponent_user_id, m.result, COUNT(*) AS n
       FROM matchup m JOIN league_season ls ON ls.league_id = m.league_id
       WHERE ls.family_id = ? AND m.result IS NOT NULL AND m.is_consolation = 0
         AND m.user_id IS NOT NULL AND m.opponent_user_id IS NOT NULL
       GROUP BY m.user_id, m.opponent_user_id, m.result`,
    )
    .all(familyId) as Array<{
    user_id: string
    opponent_user_id: string
    result: 'W' | 'L' | 'T'
    n: number
  }>

  const index = new Map<string, { wins: number; losses: number; ties: number }>()
  for (const r of rows) {
    const key = `${r.user_id}:${r.opponent_user_id}`
    const rec = index.get(key) ?? { wins: 0, losses: 0, ties: 0 }
    if (r.result === 'W') rec.wins += r.n
    else if (r.result === 'L') rec.losses += r.n
    else rec.ties += r.n
    index.set(key, rec)
  }
  return index
}

interface RawSide {
  league_id: string
  season: number
  week: number
  matchup_id: number | null
  roster_id: number
  user_id: string | null
  points: number | null
  result: 'W' | 'L' | 'T' | null
  is_playoff: number
  is_consolation: number
  team_name: string | null
  name: string | null
}

export function getWeekMatchups(db: DB, slug: string, season: number, week: number): WeekView {
  const family = getFamily(db, slug)
  const empty: WeekView = { season, week, games: [] }
  if (!family) return empty

  const sides = db
    .prepare(
      `SELECT m.league_id, ls.season, m.week, m.matchup_id, m.roster_id, m.user_id,
              m.points, m.result, m.is_playoff, m.is_consolation,
              ts.team_name,
              COALESCE(mg.canonical_name, mg.display_name, m.user_id) AS name
       FROM matchup m
       JOIN league_season ls ON ls.league_id = m.league_id
       LEFT JOIN team_season ts ON ts.league_id = m.league_id AND ts.roster_id = m.roster_id
       LEFT JOIN manager mg ON mg.user_id = m.user_id
       WHERE ls.family_id = ? AND ls.season = ? AND m.week = ?
       ORDER BY m.matchup_id, m.roster_id`,
    )
    .all(family.id, season, week) as RawSide[]

  if (sides.length === 0) return empty

  const h2h = h2hIndex(db, family.id)
  const toSide = (r: RawSide): MatchupSide => ({
    userId: r.user_id,
    name: r.name ?? `Roster ${r.roster_id}`,
    rosterId: r.roster_id,
    teamName: r.team_name,
    points: round2(r.points ?? 0),
  })

  // Group by matchup_id. A null matchup_id means Sleeper gave the team no
  // opponent that week (a bye, or an odd roster count), so each such row is
  // its own single-sided game rather than being paired with another bye.
  const groups = new Map<string, RawSide[]>()
  for (const r of sides) {
    const key = r.matchup_id == null ? `solo:${r.roster_id}` : `m:${r.matchup_id}`
    const list = groups.get(key) ?? []
    list.push(r)
    groups.set(key, list)
  }

  const games: MatchupGame[] = []
  for (const list of groups.values()) {
    const [home, away] = list
    const pairRecord =
      home?.user_id && away?.user_id
        ? (h2h.get(`${home.user_id}:${away.user_id}`) ?? { wins: 0, losses: 0, ties: 0 })
        : null

    games.push({
      matchupId: home.matchup_id,
      home: toSide(home),
      away: away ? toSide(away) : null,
      isPlayoff: !!home.is_playoff,
      isConsolation: !!home.is_consolation,
      bye: !away,
      final: away ? home.result != null && away.result != null : home.points != null,
      h2h: pairRecord
        ? {
            ...pairRecord,
            meetings: pairRecord.wins + pairRecord.losses + pairRecord.ties,
          }
        : null,
    })
  }

  // Playoff games first — they're the ones worth looking at in a playoff week.
  games.sort((a, b) => {
    if (a.isPlayoff !== b.isPlayoff) return a.isPlayoff ? -1 : 1
    if (a.isConsolation !== b.isConsolation) return a.isConsolation ? 1 : -1
    return (a.matchupId ?? 0) - (b.matchupId ?? 0)
  })

  return { season, week, games }
}
