/**
 * "If the season ended today" rookie draft order (dynasty bylaws).
 *
 *   Group 1 — non-playoff teams, reverse Max PF (lowest Max PF → 1.01)
 *   Group 2 — playoff teams that don't finish in the money, reverse Max PF
 *   Group 3 — money finishers, reverse payout order (champion → last pick)
 *
 * Linear format: every round repeats the round-1 order, then each pick goes to
 * whoever currently owns it (traded_pick).
 *
 * Only *finished* weeks count. The matchup table carries the in-progress week's
 * live scores, so the cutoff comes from the NFL calendar (see nflCalendar.ts):
 * on the Thursday week 4 kicks off, the order is still week 3's until week 4
 * goes final the following Tuesday.
 *
 * Until the playoffs are played, money finishes are projected by seed — the
 * 1 seed is "the champion", and so on — which is what "if the season ended
 * today" means. Once the season is complete, the actual final ranks are used.
 */
import type { DB } from '../db/index.js'
import { getFamily } from './queries.js'
import { lastFinalWeek, nflWeekFinalAt } from './nflCalendar.js'
import { optimalLineupPoints } from './optimalLineup.js'

/** Champion, runner-up, 3rd. The regular-season winner's payout doesn't count. */
export const PAID_PLACES = 3
/** Seeds awarded on points regardless of record (SDFF: the 6 seed). */
export const POINTS_SEEDS = 1
export const ROOKIE_ROUNDS = 4

// ── Pure ordering ────────────────────────────────────────────────────────────

export interface DraftTeam {
  rosterId: number
  userId: string | null
  name: string
  teamName: string | null
  /** Overall record: H2H plus median games, when the league plays the median. */
  wins: number
  losses: number
  ties: number
  pointsFor: number
  maxPointsFor: number
  finalRank: number | null
}

export interface OrderOptions {
  playoffTeams: number
  paidPlaces: number
  pointsSeeds: number
  /** Roster ids actually in the winners bracket; null until it's set. */
  bracketRosterIds: ReadonlySet<number> | null
  /** Use `finalRank` for the money finishes instead of projecting by seed. */
  useFinalRanks: boolean
}

export type DraftGroup = 1 | 2 | 3

export interface OrderedTeam extends DraftTeam {
  slot: number
  group: DraftGroup
  /** Playoff seed if the team is in the field, else null. */
  seed: number | null
  /** Payout place (1 = champion) for group 3, else null. */
  moneyPlace: number | null
}

const round2 = (n: number): number => Math.round(n * 100) / 100
const recordScore = (t: DraftTeam): number => t.wins + t.ties / 2

/** Reverse Max PF. Ties go to the lower actual PF, then roster id for stability. */
function byReverseMaxPf(a: DraftTeam, b: DraftTeam): number {
  return (
    round2(a.maxPointsFor) - round2(b.maxPointsFor) ||
    round2(a.pointsFor) - round2(b.pointsFor) ||
    a.rosterId - b.rosterId
  )
}

/**
 * Seeding per the bylaws: the top (playoffTeams − pointsSeeds) by record with
 * PF as the tiebreak, then the remaining seeds to the highest PF among the rest
 * regardless of record. Returns every team, seeded ones first.
 */
export function seedOrder(teams: readonly DraftTeam[], playoffTeams: number, pointsSeeds: number): DraftTeam[] {
  const byRecord = [...teams].sort(
    (a, b) => recordScore(b) - recordScore(a) || b.pointsFor - a.pointsFor || a.rosterId - b.rosterId,
  )
  const recordSeeds = Math.max(0, playoffTeams - Math.min(pointsSeeds, playoffTeams))
  const seeded = byRecord.slice(0, recordSeeds)
  const rest = byRecord.slice(recordSeeds)
  const byPoints = [...rest].sort((a, b) => b.pointsFor - a.pointsFor || a.rosterId - b.rosterId)
  const wildcards = byPoints.slice(0, playoffTeams - seeded.length)
  const wild = new Set(wildcards.map((t) => t.rosterId))
  return [...seeded, ...wildcards, ...rest.filter((t) => !wild.has(t.rosterId))]
}

export function computeDraftOrder(teams: readonly DraftTeam[], opts: OrderOptions): OrderedTeam[] {
  const order = seedOrder(teams, opts.playoffTeams, opts.pointsSeeds)
  const field = opts.bracketRosterIds
    ? order.filter((t) => opts.bracketRosterIds!.has(t.rosterId))
    : order.slice(0, Math.min(opts.playoffTeams, order.length))
  const seedOf = new Map(field.map((t, i) => [t.rosterId, i + 1]))

  let money: { team: DraftTeam; place: number }[]
  if (opts.useFinalRanks) {
    money = field
      .filter((t) => t.finalRank != null && t.finalRank <= opts.paidPlaces)
      .map((t) => ({ team: t, place: t.finalRank! }))
  } else {
    money = field.slice(0, opts.paidPlaces).map((t, i) => ({ team: t, place: i + 1 }))
  }
  const moneyPlace = new Map(money.map((m) => [m.team.rosterId, m.place]))

  const group1 = order.filter((t) => !seedOf.has(t.rosterId)).sort(byReverseMaxPf)
  const group2 = field.filter((t) => !moneyPlace.has(t.rosterId)).sort(byReverseMaxPf)
  const group3 = [...money].sort((a, b) => b.place - a.place).map((m) => m.team)

  const out: OrderedTeam[] = []
  const push = (list: DraftTeam[], group: DraftGroup) => {
    for (const t of list) {
      out.push({
        ...t,
        slot: out.length + 1,
        group,
        seed: seedOf.get(t.rosterId) ?? null,
        moneyPlace: moneyPlace.get(t.rosterId) ?? null,
      })
    }
  }
  push(group1, 1)
  push(group2, 2)
  push(group3, 3)
  return out
}

// ── DB loader ────────────────────────────────────────────────────────────────

export interface DraftPickView {
  round: number
  slot: number
  /** e.g. "1.01" */
  label: string
  originalRosterId: number
  ownerRosterId: number
  ownerName: string
  traded: boolean
}

export interface RookieDraftOrder {
  /** The season whose results set the order (null when nothing is on record). */
  season: number | null
  draftYear: number | null
  /** final: season complete · projected: in progress · waiting: no final weeks yet */
  status: 'final' | 'projected' | 'waiting' | 'none'
  /** Last regular-season week included. 0 when none. */
  throughWeek: number
  regularSeasonWeeks: number
  /** Epoch ms the next week goes final (projected only). */
  nextUpdateAt: number | null
  playoffTeams: number
  paidPlaces: number
  /** Where the playoff field came from. */
  playoffField: 'standings' | 'bracket'
  /** Where the money finishes came from. */
  moneyBasis: 'seed' | 'final'
  hasMedianScoring: boolean
  teams: OrderedTeam[]
  rounds: DraftPickView[][]
}

interface SeasonRow {
  league_id: string
  season: number
  status: string | null
  playoff_week_start: number | null
  playoff_teams: number | null
  roster_positions_json: string | null
  capabilities_json: string | null
}

interface MatchupRow {
  roster_id: number
  week: number
  points: number | null
  result: 'W' | 'L' | 'T' | null
  median_result: 'W' | 'L' | null
  players_json: string | null
  players_points_json: string | null
}

const STARTED = new Set(['in_season', 'post_season', 'complete'])

function emptyOrder(): RookieDraftOrder {
  return {
    season: null,
    draftYear: null,
    status: 'none',
    throughWeek: 0,
    regularSeasonWeeks: 0,
    nextUpdateAt: null,
    playoffTeams: 0,
    paidPlaces: PAID_PLACES,
    playoffField: 'standings',
    moneyBasis: 'seed',
    hasMedianScoring: false,
    teams: [],
    rounds: [],
  }
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function getRookieDraftOrder(db: DB, slug: string, now = Date.now()): RookieDraftOrder {
  const family = getFamily(db, slug)
  if (!family) return emptyOrder()

  const seasons = db
    .prepare(
      `SELECT league_id, season, status, playoff_week_start, playoff_teams,
              roster_positions_json, capabilities_json
       FROM league_season WHERE family_id = ? ORDER BY season DESC`,
    )
    .all(family.id) as SeasonRow[]
  if (seasons.length === 0) return emptyOrder()

  // In the offseason the newest league-season hasn't kicked off yet; the
  // upcoming draft is still decided by the season before it.
  const target =
    !STARTED.has(seasons[0].status ?? '') && seasons[1] ? seasons[1] : seasons[0]
  const leagueId = target.league_id
  const season = target.season
  const caps = parseJson<{ hasMedianScoring?: boolean; playoffTeams?: number; playoffWeekStart?: number }>(
    target.capabilities_json,
    {},
  )
  const playoffWeekStart = target.playoff_week_start ?? caps.playoffWeekStart ?? 15
  const playoffTeams = target.playoff_teams ?? caps.playoffTeams ?? 6
  const regularSeasonWeeks = playoffWeekStart - 1
  const hasMedianScoring = caps.hasMedianScoring === true
  const isComplete = target.status === 'complete'

  const lastSync = db
    .prepare(
      `SELECT MAX(started_at) AS at FROM sync_log
       WHERE league_id = ? AND scope = ? AND status = 'ok'`,
    )
    .get(leagueId, `season:${leagueId}`) as { at: number | null } | undefined
  const finalWeek = isComplete
    ? regularSeasonWeeks
    : lastFinalWeek(season, now, lastSync?.at ?? null)
  const throughWeek = Math.min(finalWeek, regularSeasonWeeks)

  const base: RookieDraftOrder = {
    ...emptyOrder(),
    season,
    draftYear: season + 1,
    status: 'waiting',
    throughWeek: 0,
    regularSeasonWeeks,
    nextUpdateAt: nflWeekFinalAt(season, Math.max(throughWeek, 0) + 1),
    playoffTeams,
    hasMedianScoring,
  }
  if (throughWeek < 1) return base

  const games = db
    .prepare(
      `SELECT roster_id, week, points, result, median_result, players_json, players_points_json
       FROM matchup WHERE league_id = ? AND week <= ? AND week < ?`,
    )
    .all(leagueId, throughWeek, playoffWeekStart) as MatchupRow[]
  if (games.length === 0) return base

  const rosterPositions = parseJson<string[]>(target.roster_positions_json, [])
  const positions = new Map(
    (
      db
        .prepare(
          `SELECT p.player_id, p.position FROM player p
           WHERE p.player_id IN (
             SELECT DISTINCT j.value FROM matchup m, json_each(m.players_json) j
             WHERE m.league_id = ? AND m.week <= ? AND m.players_json IS NOT NULL)`,
        )
        .all(leagueId, throughWeek) as { player_id: string; position: string | null }[]
    ).map((r) => [r.player_id, r.position]),
  )

  const teamRows = db
    .prepare(
      `SELECT ts.roster_id, ts.user_id, ts.team_name, ts.final_rank,
              COALESCE(m.canonical_name, m.display_name) AS name
       FROM team_season ts LEFT JOIN manager m ON m.user_id = ts.user_id
       WHERE ts.league_id = ?`,
    )
    .all(leagueId) as {
    roster_id: number
    user_id: string | null
    team_name: string | null
    final_rank: number | null
    name: string | null
  }[]

  const teams = new Map<number, DraftTeam>()
  for (const r of teamRows) {
    teams.set(r.roster_id, {
      rosterId: r.roster_id,
      userId: r.user_id,
      name: r.name ?? r.team_name ?? `Roster ${r.roster_id}`,
      teamName: r.team_name,
      wins: 0,
      losses: 0,
      ties: 0,
      pointsFor: 0,
      maxPointsFor: 0,
      finalRank: r.final_rank,
    })
  }

  for (const g of games) {
    const t = teams.get(g.roster_id)
    if (!t) continue
    if (g.result === 'W') t.wins++
    else if (g.result === 'L') t.losses++
    else if (g.result === 'T') t.ties++
    if (hasMedianScoring) {
      if (g.median_result === 'W') t.wins++
      else if (g.median_result === 'L') t.losses++
    }

    const points = g.points ?? 0
    t.pointsFor += points
    const ids = parseJson<string[]>(g.players_json, [])
    const pts = parseJson<Record<string, number | null>>(g.players_points_json, {})
    const optimal = optimalLineupPoints(
      rosterPositions,
      ids.map((id) => ({ position: positions.get(id) ?? null, points: pts[id] ?? 0 })),
    )
    // Max PF can never be below what was actually scored (guards weeks whose
    // per-player scores Sleeper lost — see matchup.data_quality).
    t.maxPointsFor += Math.max(optimal, points)
  }
  for (const t of teams.values()) {
    t.pointsFor = round2(t.pointsFor)
    t.maxPointsFor = round2(t.maxPointsFor)
  }

  // The winners bracket is authoritative for who made it once the regular
  // season is over (it reflects any manual seeding the commissioner did).
  let bracketRosterIds: Set<number> | null = null
  if (throughWeek >= regularSeasonWeeks) {
    const rows = db
      .prepare(
        `SELECT t1_roster_id, t2_roster_id FROM playoff_bracket
         WHERE league_id = ? AND bracket = 'winners'`,
      )
      .all(leagueId) as { t1_roster_id: number | null; t2_roster_id: number | null }[]
    const ids = new Set<number>()
    for (const r of rows) {
      if (r.t1_roster_id != null) ids.add(r.t1_roster_id)
      if (r.t2_roster_id != null) ids.add(r.t2_roster_id)
    }
    if (ids.size > 0) bracketRosterIds = ids
  }

  const placed = new Set(teamRows.map((r) => r.final_rank).filter((r) => r != null))
  const useFinalRanks =
    isComplete && Array.from({ length: PAID_PLACES }, (_, i) => i + 1).every((p) => placed.has(p))

  const ordered = computeDraftOrder([...teams.values()], {
    playoffTeams,
    paidPlaces: PAID_PLACES,
    pointsSeeds: POINTS_SEEDS,
    bracketRosterIds,
    useFinalRanks,
  })

  // Current ownership of next year's picks. Roster ids are only meaningful
  // within this league-season, so resolve them against this league's teams.
  const owners = new Map<string, number>()
  for (const p of db
    .prepare(
      `SELECT round, original_roster_id, current_owner_roster_id FROM traded_pick
       WHERE league_id = ? AND pick_season = ?`,
    )
    .all(leagueId, String(season + 1)) as {
    round: number
    original_roster_id: number
    current_owner_roster_id: number
  }[]) {
    owners.set(`${p.round}:${p.original_roster_id}`, p.current_owner_roster_id)
  }

  const width = String(ordered.length).length < 2 ? 2 : String(ordered.length).length
  const rounds: DraftPickView[][] = []
  for (let round = 1; round <= ROOKIE_ROUNDS; round++) {
    rounds.push(
      ordered.map((t) => {
        const owner = owners.get(`${round}:${t.rosterId}`) ?? t.rosterId
        return {
          round,
          slot: t.slot,
          label: `${round}.${String(t.slot).padStart(width, '0')}`,
          originalRosterId: t.rosterId,
          ownerRosterId: owner,
          ownerName: teams.get(owner)?.name ?? `Roster ${owner}`,
          traded: owner !== t.rosterId,
        }
      }),
    )
  }

  return {
    season,
    draftYear: season + 1,
    status: isComplete ? 'final' : 'projected',
    throughWeek,
    regularSeasonWeeks,
    nextUpdateAt:
      isComplete || throughWeek >= regularSeasonWeeks ? null : nflWeekFinalAt(season, throughWeek + 1),
    playoffTeams,
    paidPlaces: PAID_PLACES,
    playoffField: bracketRosterIds ? 'bracket' : 'standings',
    moneyBasis: useFinalRanks ? 'final' : 'seed',
    hasMedianScoring,
    teams: ordered,
    rounds,
  }
}
