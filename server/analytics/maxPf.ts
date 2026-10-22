/**
 * Max PF — "the best lineup you could have started", per team per week.
 *
 * Sleeper's weekly report ranks teams by actual-of-possible: what you scored
 * out of the best lineup available from *every* player you rostered that week,
 * taxi squad and IR included. This reproduces that, and then goes one step
 * further by naming the lineup — which bench player belonged in the WR slot,
 * and which starter should have sat.
 *
 * Only finished weeks are served (`is_final = 1`): a week in progress has a
 * meaningless "best lineup", since nobody's score is settled.
 *
 * The taxi toggle is the interesting bit. Sleeper counts taxi players, so the
 * default matches Sleeper; `includeTaxi: false` answers the fairer question of
 * what the manager could *legally* have started, using the weekly taxi record
 * in `roster_week_status` (see migrations/006).
 */
import type { DB } from '../db/index.js'
import { getFamily } from './queries.js'
import { optimalLineup, type LineupSlot } from './optimalLineup.js'

const round2 = (n: number): number => Math.round(n * 100) / 100
/** Efficiency keeps four decimals so a 0.1% gap still sorts. */
const round4 = (n: number): number => Math.round(n * 10000) / 10000

export type PlayerStatus = 'taxi' | 'ir'

export interface MaxPfSeasonWeeks {
  season: number
  /** Finished weeks only, ascending. */
  weeks: number[]
  playoffWeekStart: number | null
}

export interface MaxPfLineupSlot {
  slot: string
  playerId: string | null
  playerName: string | null
  position: string | null
  nflTeam: string | null
  points: number
  /** True when this player was in the manager's actual starting lineup. */
  startedActually: boolean
  status: PlayerStatus | null
}

export interface MaxPfBenchedStarter {
  playerId: string
  playerName: string | null
  position: string | null
  nflTeam: string | null
  points: number
}

export interface MaxPfTeamWeek {
  rosterId: number
  userId: string | null
  name: string
  teamName: string | null
  /** Sleeper avatar id; the client builds the CDN url from it. */
  avatar: string | null
  actual: number
  max: number
  /** actual / max, 0–1. Zero when the team has no max to speak of. */
  efficiency: number
  leftOnBench: number
  bestLineup: MaxPfLineupSlot[]
  /** Actual starters who didn't make the best lineup, worst score first. */
  shouldHaveSat: MaxPfBenchedStarter[]
}

export interface MaxPfBlunder {
  rosterId: number
  userId: string | null
  name: string
  week: number
  leftOnBench: number
  actual: number
  max: number
}

export interface MaxPfWeekView {
  season: number
  week: number
  taxiIncluded: boolean
  /** True when this week's taxi record was inferred from today's taxi squads. */
  taxiInferred: boolean
  /** Does this league even have a taxi squad? */
  hasTaxiSquad: boolean
  /** Ranked by efficiency, best first. */
  teams: MaxPfTeamWeek[]
  blunder: MaxPfBlunder | null
}

export interface MaxPfSeasonTeam {
  rosterId: number
  userId: string | null
  name: string
  teamName: string | null
  avatar: string | null
  weeks: number
  actual: number
  max: number
  efficiency: number
  leftOnBench: number
}

export interface MaxPfSeasonView {
  season: number
  taxiIncluded: boolean
  hasTaxiSquad: boolean
  /** Finished weeks included in the totals. */
  weeks: number[]
  /** True when any included week's taxi record was inferred. */
  taxiInferred: boolean
  teams: MaxPfSeasonTeam[]
  /** The season's worst single week. */
  blunder: MaxPfBlunder | null
}

// ── Shared loading ───────────────────────────────────────────────────────────

interface TeamRow {
  rosterId: number
  userId: string | null
  name: string
  teamName: string | null
  avatar: string | null
}

interface PlayerRow {
  fullName: string | null
  position: string | null
  /** Every slot he's eligible for; see optimalLineup.ts. */
  positions: string[] | null
  team: string | null
}

interface SeasonContext {
  leagueId: string
  season: number
  rosterPositions: string[]
  hasTaxiSquad: boolean
  teams: Map<number, TeamRow>
  players: Map<string, PlayerRow>
}

interface GameRow {
  week: number
  roster_id: number
  points: number | null
  starters_json: string | null
  players_json: string | null
  players_points_json: string | null
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function loadSeason(db: DB, slug: string, season: number): SeasonContext | null {
  const family = getFamily(db, slug)
  if (!family) return null
  const row = db
    .prepare(
      `SELECT league_id, roster_positions_json, capabilities_json FROM league_season
       WHERE family_id = ? AND season = ?`,
    )
    .get(family.id, season) as
    | { league_id: string; roster_positions_json: string | null; capabilities_json: string | null }
    | undefined
  if (!row) return null

  const caps = parseJson<{ hasTaxiSquad?: boolean }>(row.capabilities_json, {})

  const teamRows = db
    .prepare(
      `SELECT ts.roster_id, ts.user_id, ts.team_name, m.avatar,
              COALESCE(m.canonical_name, m.display_name, ts.user_id) AS name
       FROM team_season ts LEFT JOIN manager m ON m.user_id = ts.user_id
       WHERE ts.league_id = ?`,
    )
    .all(row.league_id) as Array<{
    roster_id: number
    user_id: string | null
    team_name: string | null
    avatar: string | null
    name: string | null
  }>

  const teams = new Map<number, TeamRow>(
    teamRows.map((t) => [
      t.roster_id,
      {
        rosterId: t.roster_id,
        userId: t.user_id,
        name: t.name ?? t.team_name ?? `Roster ${t.roster_id}`,
        teamName: t.team_name,
        avatar: t.avatar,
      },
    ]),
  )

  // Only the players who actually appeared on a roster this season, so an
  // 11,000-row dictionary isn't dragged into every request.
  const playerRows = db
    .prepare(
      `SELECT p.player_id, p.full_name, p.position, p.fantasy_positions_json, p.team FROM player p
       WHERE p.player_id IN (
         SELECT DISTINCT j.value FROM matchup m, json_each(m.players_json) j
         WHERE m.league_id = ? AND m.players_json IS NOT NULL)`,
    )
    .all(row.league_id) as Array<{
    player_id: string
    full_name: string | null
    position: string | null
    fantasy_positions_json: string | null
    team: string | null
  }>

  const players = new Map<string, PlayerRow>(
    playerRows.map((p) => [
      p.player_id,
      {
        fullName: p.full_name,
        position: p.position,
        positions: parseJson<string[] | null>(p.fantasy_positions_json, null),
        team: p.team,
      },
    ]),
  )

  return {
    leagueId: row.league_id,
    season,
    rosterPositions: parseJson<string[]>(row.roster_positions_json, []),
    hasTaxiSquad: caps.hasTaxiSquad === true,
    teams,
    players,
  }
}

interface WeekStatus {
  /** player_id -> status, for this one week. */
  byPlayer: Map<string, PlayerStatus>
  taxi: Set<string>
  inferred: boolean
}

function loadStatuses(db: DB, leagueId: string, weeks: readonly number[]): Map<number, WeekStatus> {
  const out = new Map<number, WeekStatus>()
  if (weeks.length === 0) return out
  const placeholders = weeks.map(() => '?').join(',')
  const rows = db
    .prepare(
      `SELECT week, player_id, status, source FROM roster_week_status
       WHERE league_id = ? AND week IN (${placeholders})`,
    )
    .all(leagueId, ...weeks) as Array<{
    week: number
    player_id: string
    status: PlayerStatus
    source: string
  }>
  for (const r of rows) {
    let entry = out.get(r.week)
    if (!entry) {
      entry = { byPlayer: new Map(), taxi: new Set(), inferred: false }
      out.set(r.week, entry)
    }
    entry.byPlayer.set(r.player_id, r.status)
    if (r.status === 'taxi') entry.taxi.add(r.player_id)
    if (r.source === 'inferred') entry.inferred = true
  }
  return out
}

/** Which season/week combinations have finished games, for building a picker. */
export function getMaxPfWeeks(db: DB, slug: string): MaxPfSeasonWeeks[] {
  const family = getFamily(db, slug)
  if (!family) return []
  const rows = db
    .prepare(
      `SELECT ls.season, m.week, ls.playoff_week_start
       FROM matchup m JOIN league_season ls ON ls.league_id = m.league_id
       WHERE ls.family_id = ? AND m.is_final = 1
       GROUP BY ls.season, m.week
       ORDER BY ls.season DESC, m.week`,
    )
    .all(family.id) as Array<{ season: number; week: number; playoff_week_start: number | null }>

  const bySeason = new Map<number, MaxPfSeasonWeeks>()
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

// ── One team's week ──────────────────────────────────────────────────────────

function teamWeek(
  ctx: SeasonContext,
  game: GameRow,
  status: WeekStatus | undefined,
  includeTaxi: boolean,
): MaxPfTeamWeek | null {
  const team = ctx.teams.get(game.roster_id)
  if (!team) return null

  const ids = parseJson<string[]>(game.players_json, [])
  const pts = parseJson<Record<string, number | null>>(game.players_points_json, {})
  const pointsOf = (id: string): number => pts[id] ?? 0
  // Sleeper writes '0' into a starting slot nobody filled.
  const startedIds = new Set(
    parseJson<string[]>(game.starters_json, []).filter((id) => id && id !== '0'),
  )

  const lineup = optimalLineup(
    ctx.rosterPositions,
    ids.map((id) => {
      const player = ctx.players.get(id)
      return {
        playerId: id,
        position: player?.position ?? null,
        positions: player?.positions ?? null,
        points: pointsOf(id),
      }
    }),
    includeTaxi ? {} : { excludePlayerIds: status?.taxi ?? new Set<string>() },
  )

  const actual = round2(game.points ?? 0)
  // A best lineup can't be worth less than what was really scored; when it
  // looks that way, Sleeper lost the week's per-player scores.
  const max = round2(Math.max(lineup.total, actual))
  const leftOnBench = round2(Math.max(0, max - actual))

  const describe = (slot: LineupSlot): MaxPfLineupSlot => {
    const player = slot.playerId ? ctx.players.get(slot.playerId) : undefined
    return {
      slot: slot.slot,
      playerId: slot.playerId,
      playerName: player?.fullName ?? null,
      position: slot.position ?? player?.position ?? null,
      nflTeam: player?.team ?? null,
      points: round2(slot.points),
      startedActually: slot.playerId != null && startedIds.has(slot.playerId),
      status: (slot.playerId ? status?.byPlayer.get(slot.playerId) : null) ?? null,
    }
  }

  const inBest = new Set(
    lineup.slots.map((s) => s.playerId).filter((id): id is string => id != null),
  )
  const shouldHaveSat: MaxPfBenchedStarter[] = [...startedIds]
    .filter((id) => !inBest.has(id))
    .map((id) => {
      const player = ctx.players.get(id)
      return {
        playerId: id,
        playerName: player?.fullName ?? null,
        position: player?.position ?? null,
        nflTeam: player?.team ?? null,
        points: round2(pointsOf(id)),
      }
    })
    .sort((a, b) => a.points - b.points)

  return {
    rosterId: team.rosterId,
    userId: team.userId,
    name: team.name,
    teamName: team.teamName,
    avatar: team.avatar,
    actual,
    max,
    efficiency: max > 0 ? Math.min(1, round4(actual / max)) : 0,
    leftOnBench,
    bestLineup: lineup.slots.map(describe),
    shouldHaveSat,
  }
}

function games(db: DB, leagueId: string, week?: number): GameRow[] {
  const clause = week == null ? '' : ' AND m.week = ?'
  const params: unknown[] = week == null ? [leagueId] : [leagueId, week]
  return db
    .prepare(
      `SELECT m.week, m.roster_id, m.points, m.starters_json, m.players_json, m.players_points_json
       FROM matchup m
       WHERE m.league_id = ? AND m.is_final = 1${clause}
       ORDER BY m.week, m.roster_id`,
    )
    .all(...params) as GameRow[]
}

function toBlunder(team: MaxPfTeamWeek, week: number): MaxPfBlunder {
  return {
    rosterId: team.rosterId,
    userId: team.userId,
    name: team.name,
    week,
    leftOnBench: team.leftOnBench,
    actual: team.actual,
    max: team.max,
  }
}

// ── Public reads ─────────────────────────────────────────────────────────────

export function getMaxPfWeek(
  db: DB,
  slug: string,
  season: number,
  week: number,
  opts: { includeTaxi?: boolean } = {},
): MaxPfWeekView | null {
  const ctx = loadSeason(db, slug, season)
  if (!ctx) return null
  const includeTaxi = opts.includeTaxi !== false

  const rows = games(db, ctx.leagueId, week)
  if (rows.length === 0) return null

  const status = loadStatuses(db, ctx.leagueId, [week]).get(week)
  const teams = rows
    .map((g) => teamWeek(ctx, g, status, includeTaxi))
    .filter((t): t is MaxPfTeamWeek => t !== null)
    .sort((a, b) => b.efficiency - a.efficiency || b.actual - a.actual)

  const worst = [...teams].sort((a, b) => b.leftOnBench - a.leftOnBench)[0]

  return {
    season,
    week,
    taxiIncluded: includeTaxi,
    taxiInferred: status?.inferred === true,
    hasTaxiSquad: ctx.hasTaxiSquad,
    teams,
    blunder: worst && worst.leftOnBench > 0 ? toBlunder(worst, week) : null,
  }
}

export function getMaxPfSeason(
  db: DB,
  slug: string,
  season: number,
  opts: { includeTaxi?: boolean } = {},
): MaxPfSeasonView | null {
  const ctx = loadSeason(db, slug, season)
  if (!ctx) return null
  const includeTaxi = opts.includeTaxi !== false

  const rows = games(db, ctx.leagueId)
  if (rows.length === 0) return null

  const weeks = [...new Set(rows.map((r) => r.week))].sort((a, b) => a - b)
  const statuses = loadStatuses(db, ctx.leagueId, weeks)

  const totals = new Map<number, MaxPfSeasonTeam>()
  let blunder: MaxPfBlunder | null = null

  for (const g of rows) {
    const tw = teamWeek(ctx, g, statuses.get(g.week), includeTaxi)
    if (!tw) continue

    let agg = totals.get(tw.rosterId)
    if (!agg) {
      agg = {
        rosterId: tw.rosterId,
        userId: tw.userId,
        name: tw.name,
        teamName: tw.teamName,
        avatar: tw.avatar,
        weeks: 0,
        actual: 0,
        max: 0,
        efficiency: 0,
        leftOnBench: 0,
      }
      totals.set(tw.rosterId, agg)
    }
    agg.weeks++
    agg.actual += tw.actual
    agg.max += tw.max
    agg.leftOnBench += tw.leftOnBench

    if (tw.leftOnBench > 0 && (!blunder || tw.leftOnBench > blunder.leftOnBench)) {
      blunder = toBlunder(tw, g.week)
    }
  }

  const teams = [...totals.values()]
    .map((t) => ({
      ...t,
      actual: round2(t.actual),
      max: round2(t.max),
      leftOnBench: round2(t.leftOnBench),
      efficiency: t.max > 0 ? Math.min(1, round4(t.actual / t.max)) : 0,
    }))
    .sort((a, b) => b.efficiency - a.efficiency || b.actual - a.actual)

  return {
    season,
    taxiIncluded: includeTaxi,
    hasTaxiSquad: ctx.hasTaxiSquad,
    weeks,
    taxiInferred: weeks.some((w) => statuses.get(w)?.inferred === true),
    teams,
    blunder,
  }
}
