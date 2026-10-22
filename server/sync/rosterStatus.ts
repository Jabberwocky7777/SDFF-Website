/**
 * Weekly taxi / IR membership (see migrations/006_roster_week_status.sql).
 *
 * Sleeper exposes only a roster's *current* taxi and reserve lists and logs
 * neither a taxi activation nor an IR move as a transaction, so the weekly
 * record has to be built up as the season runs: snapshot the live week every
 * sync, freeze it once the week is final.
 *
 * `statusRows` is the pure shape-the-rows half; the writers below are the only
 * things that touch the DB.
 */
import type { DB } from '../db/index.js'
import type { SleeperRoster } from '../sleeper/schemas.js'

export type RosterStatus = 'taxi' | 'ir'
export type StatusSource = 'snapshot' | 'inferred'

export interface RosterWeekStatusRow {
  leagueId: string
  week: number
  rosterId: number
  playerId: string
  status: RosterStatus
  source: StatusSource
}

export interface StatusRowOptions {
  /** Include each roster's `reserve` list as 'ir'. Off for inferred weeks. */
  includeIr: boolean
  /** Include each roster's `taxi` list. Off for leagues with no taxi squad. */
  includeTaxi: boolean
}

/**
 * Flatten a week's rosters into status rows.
 *
 * Taxi wins a collision: the table is keyed by player, and a player who
 * somehow appears on both lists is more interestingly a taxi player (taxi
 * changes Max PF when it's switched off; IR never does).
 */
export function statusRows(
  leagueId: string,
  week: number,
  rosters: readonly SleeperRoster[],
  source: StatusSource,
  opts: StatusRowOptions,
): RosterWeekStatusRow[] {
  const seen = new Set<string>()
  const rows: RosterWeekStatusRow[] = []
  const add = (rosterId: number, playerId: string, status: RosterStatus) => {
    if (seen.has(playerId)) return
    seen.add(playerId)
    rows.push({ leagueId, week, rosterId, playerId, status, source })
  }
  if (opts.includeTaxi) {
    for (const r of rosters) {
      for (const playerId of r.taxi ?? []) add(r.roster_id, playerId, 'taxi')
    }
  }
  if (opts.includeIr) {
    for (const r of rosters) {
      for (const playerId of r.reserve ?? []) add(r.roster_id, playerId, 'ir')
    }
  }
  return rows
}

/** Replace one week's rows wholesale. A week with no taxi/IR ends up empty. */
export function replaceWeekStatus(
  db: DB,
  leagueId: string,
  week: number,
  rows: readonly RosterWeekStatusRow[],
): void {
  const del = db.prepare(`DELETE FROM roster_week_status WHERE league_id = ? AND week = ?`)
  const ins = db.prepare(
    `INSERT INTO roster_week_status (league_id, week, roster_id, player_id, status, source)
     VALUES (@leagueId, @week, @rosterId, @playerId, @status, @source)`,
  )
  const write = db.transaction(() => {
    del.run(leagueId, week)
    for (const row of rows) ins.run(row)
  })
  write()
}

/** Weeks of this league that already hold a snapshot taken while they were live. */
export function snapshottedWeeks(db: DB, leagueId: string): Set<number> {
  const rows = db
    .prepare(
      `SELECT DISTINCT week FROM roster_week_status
       WHERE league_id = ? AND source = 'snapshot'`,
    )
    .all(leagueId) as Array<{ week: number }>
  return new Set(rows.map((r) => r.week))
}

export interface WeekIngested {
  week: number
  isFinal: boolean
}

/**
 * Bring a league-season's taxi/IR record up to date from today's rosters.
 *
 * - the live week (if any) gets a fresh snapshot of taxi **and** IR
 * - a final week that was never snapshotted gets today's taxi list as
 *   'inferred' — exact under the SDFF bylaws except for mid-season activations
 * - a final week that *was* snapshotted is left alone
 *
 * Only called for the season in progress: today's lists say nothing about a
 * season that has already finished.
 */
export function syncRosterWeekStatus(
  db: DB,
  args: {
    leagueId: string
    rosters: readonly SleeperRoster[]
    weeks: readonly WeekIngested[]
    hasTaxiSquad: boolean
  },
): { snapshotted: number[]; inferred: number[] } {
  const { leagueId, rosters, weeks, hasTaxiSquad } = args
  const already = snapshottedWeeks(db, leagueId)
  const snapshotted: number[] = []
  const inferred: number[] = []

  for (const { week, isFinal } of weeks) {
    if (!isFinal) {
      replaceWeekStatus(
        db,
        leagueId,
        week,
        statusRows(leagueId, week, rosters, 'snapshot', { includeIr: true, includeTaxi: hasTaxiSquad }),
      )
      snapshotted.push(week)
      continue
    }
    if (already.has(week) || !hasTaxiSquad) continue
    replaceWeekStatus(
      db,
      leagueId,
      week,
      statusRows(leagueId, week, rosters, 'inferred', { includeIr: false, includeTaxi: true }),
    )
    inferred.push(week)
  }

  return { snapshotted, inferred }
}
