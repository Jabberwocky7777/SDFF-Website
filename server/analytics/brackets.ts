/**
 * Playoff brackets for one season.
 *
 * Reads the stored `playoff_bracket` rows and dresses them with the things a
 * bracket needs to be readable: manager names, regular-season seeds, and the
 * score each side actually put up in that round's week.
 *
 * Roster ids in `playoff_bracket` are scoped to their own `league_id`, so every
 * lookup here joins on that league and never across seasons — the same trap
 * that makes cross-season roster ids meaningless everywhere else.
 */
import type { DB } from '../db/index.js'
import { getFamily } from './queries.js'

export interface BracketTeam {
  rosterId: number
  userId: string | null
  name: string
  teamName: string | null
  /** Regular-season finish, which is what the bracket seeds off. */
  seed: number | null
  points: number | null
  won: boolean
}

export interface BracketMatchView {
  matchId: number
  round: number
  /** The week this round was played, so scores can be looked up and labelled. */
  week: number | null
  t1: BracketTeam | null
  t2: BracketTeam | null
  /** The placement this match decides — 1 for the championship. */
  placement: number | null
  /** Which matches feed this one, e.g. `{ t1: 'winner of 3' }`. */
  from: { t1: string | null; t2: string | null }
}

export interface BracketView {
  bracket: 'winners' | 'losers'
  rounds: Array<{ round: number; week: number | null; matches: BracketMatchView[] }>
}

export interface SeasonBracketView {
  season: number
  leagueId: string
  playoffWeekStart: number | null
  winners: BracketView
  losers: BracketView
}

interface RawMatch {
  bracket: 'winners' | 'losers'
  match_id: number
  round: number
  t1_roster_id: number | null
  t2_roster_id: number | null
  winner_roster_id: number | null
  loser_roster_id: number | null
  placement: number | null
  t1_from_json: string | null
  t2_from_json: string | null
}

/** `{ w: 3 }` → "winner of 3"; `{ l: 3 }` → "loser of 3". */
function describeFrom(json: string | null): string | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>
    if (typeof parsed.w === 'number') return `winner of ${parsed.w}`
    if (typeof parsed.l === 'number') return `loser of ${parsed.l}`
  } catch {
    /* Sleeper shape drifted — the label is decoration, so drop it quietly. */
  }
  return null
}

export function getSeasonBracket(db: DB, slug: string, season: number): SeasonBracketView | null {
  const family = getFamily(db, slug)
  if (!family) return null

  const leagueRow = db
    .prepare(
      `SELECT league_id, playoff_week_start FROM league_season
       WHERE family_id = ? AND season = ?`,
    )
    .get(family.id, season) as
    | { league_id: string; playoff_week_start: number | null }
    | undefined
  if (!leagueRow) return null
  const leagueId = leagueRow.league_id

  const matches = db
    .prepare(
      `SELECT bracket, match_id, round, t1_roster_id, t2_roster_id,
              winner_roster_id, loser_roster_id, placement, t1_from_json, t2_from_json
       FROM playoff_bracket WHERE league_id = ?
       ORDER BY bracket, round, match_id`,
    )
    .all(leagueId) as RawMatch[]

  if (matches.length === 0) return null

  // Roster → identity, scoped to this league-season.
  const teams = new Map<
    number,
    { userId: string | null; name: string; teamName: string | null; seed: number | null }
  >()
  for (const r of db
    .prepare(
      `SELECT ts.roster_id, ts.user_id, ts.team_name, ts.regular_season_rank,
              COALESCE(m.canonical_name, m.display_name, ts.user_id) AS name
       FROM team_season ts LEFT JOIN manager m ON m.user_id = ts.user_id
       WHERE ts.league_id = ?`,
    )
    .all(leagueId) as Array<{
    roster_id: number
    user_id: string | null
    team_name: string | null
    regular_season_rank: number | null
    name: string | null
  }>) {
    teams.set(r.roster_id, {
      userId: r.user_id,
      name: r.name ?? `Roster ${r.roster_id}`,
      teamName: r.team_name,
      seed: r.regular_season_rank,
    })
  }

  // Scores, keyed week:roster. A bracket round maps onto one fantasy week.
  const points = new Map<string, number>()
  for (const r of db
    .prepare(`SELECT week, roster_id, points FROM matchup WHERE league_id = ?`)
    .all(leagueId) as Array<{ week: number; roster_id: number; points: number | null }>) {
    if (r.points != null) points.set(`${r.week}:${r.roster_id}`, r.points)
  }

  const weekOf = (round: number): number | null =>
    leagueRow.playoff_week_start != null ? leagueRow.playoff_week_start + round - 1 : null

  const toTeam = (
    rosterId: number | null,
    week: number | null,
    winnerRosterId: number | null,
  ): BracketTeam | null => {
    if (rosterId == null) return null
    const info = teams.get(rosterId)
    return {
      rosterId,
      userId: info?.userId ?? null,
      name: info?.name ?? `Roster ${rosterId}`,
      teamName: info?.teamName ?? null,
      seed: info?.seed ?? null,
      points: week != null ? (points.get(`${week}:${rosterId}`) ?? null) : null,
      won: winnerRosterId != null && winnerRosterId === rosterId,
    }
  }

  const build = (bracket: 'winners' | 'losers'): BracketView => {
    const byRound = new Map<number, BracketMatchView[]>()
    for (const m of matches.filter((x) => x.bracket === bracket)) {
      const week = weekOf(m.round)
      const view: BracketMatchView = {
        matchId: m.match_id,
        round: m.round,
        week,
        t1: toTeam(m.t1_roster_id, week, m.winner_roster_id),
        t2: toTeam(m.t2_roster_id, week, m.winner_roster_id),
        placement: m.placement,
        from: { t1: describeFrom(m.t1_from_json), t2: describeFrom(m.t2_from_json) },
      }
      const list = byRound.get(m.round) ?? []
      list.push(view)
      byRound.set(m.round, list)
    }
    return {
      bracket,
      rounds: [...byRound.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([round, ms]) => ({ round, week: weekOf(round), matches: ms })),
    }
  }

  return {
    season,
    leagueId,
    playoffWeekStart: leagueRow.playoff_week_start,
    winners: build('winners'),
    losers: build('losers'),
  }
}

/**
 * Seasons with a bracket worth showing.
 *
 * Sleeper hands back a bracket skeleton for a league that hasn't played yet —
 * the right number of matches, every slot null — so "has rows" isn't the test.
 * At least one decided match is.
 */
export function getBracketSeasons(db: DB, slug: string): number[] {
  const family = getFamily(db, slug)
  if (!family) return []
  const rows = db
    .prepare(
      `SELECT DISTINCT ls.season FROM playoff_bracket pb
       JOIN league_season ls ON ls.league_id = pb.league_id
       WHERE ls.family_id = ? AND pb.winner_roster_id IS NOT NULL
       ORDER BY ls.season DESC`,
    )
    .all(family.id) as Array<{ season: number }>
  return rows.map((r) => r.season)
}
