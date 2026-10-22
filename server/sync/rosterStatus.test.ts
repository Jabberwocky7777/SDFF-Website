import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { replaceWeekStatus, statusRows, syncRosterWeekStatus } from './rosterStatus.js'
import type { SleeperRoster } from '../sleeper/schemas.js'
import type { DB } from '../db/index.js'

const migrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'db',
  'migrations',
)

const roster = (
  roster_id: number,
  taxi: string[] = [],
  reserve: string[] = [],
): SleeperRoster => ({ roster_id, taxi, reserve })

function emptyDb(): DB {
  const db = new Database(':memory:')
  for (const f of fs.readdirSync(migrationsDir).filter((x) => x.endsWith('.sql')).sort()) {
    db.exec(fs.readFileSync(path.join(migrationsDir, f), 'utf8'))
  }
  db.prepare(
    `INSERT INTO league_family (id, slug, display_name, league_type, current_league_id)
     VALUES (1,'d','D','dynasty','L26')`,
  ).run()
  db.prepare(
    `INSERT INTO league_season (league_id, family_id, season, status) VALUES ('L26',1,2026,'in_season')`,
  ).run()
  return db
}

function read(db: DB): Array<{ week: number; player_id: string; status: string; source: string }> {
  return db
    .prepare(
      `SELECT week, player_id, status, source FROM roster_week_status
       ORDER BY week, status, player_id`,
    )
    .all() as Array<{ week: number; player_id: string; status: string; source: string }>
}

describe('statusRows', () => {
  it('flattens taxi and reserve into one row per player', () => {
    const rows = statusRows('L26', 3, [roster(1, ['a'], ['b']), roster(2, ['c'])], 'snapshot', {
      includeIr: true,
      includeTaxi: true,
    })
    expect(rows).toEqual([
      { leagueId: 'L26', week: 3, rosterId: 1, playerId: 'a', status: 'taxi', source: 'snapshot' },
      { leagueId: 'L26', week: 3, rosterId: 2, playerId: 'c', status: 'taxi', source: 'snapshot' },
      { leagueId: 'L26', week: 3, rosterId: 1, playerId: 'b', status: 'ir', source: 'snapshot' },
    ])
  })

  it('leaves taxi or IR out when asked', () => {
    const rosters = [roster(1, ['a'], ['b'])]
    expect(
      statusRows('L26', 1, rosters, 'inferred', { includeIr: false, includeTaxi: true }).map(
        (r) => r.playerId,
      ),
    ).toEqual(['a'])
    expect(
      statusRows('L26', 1, rosters, 'snapshot', { includeIr: true, includeTaxi: false }).map(
        (r) => r.playerId,
      ),
    ).toEqual(['b'])
  })

  it('keeps taxi when a player is somehow on both lists', () => {
    const rows = statusRows('L26', 1, [roster(1, ['a'], ['a'])], 'snapshot', {
      includeIr: true,
      includeTaxi: true,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('taxi')
  })
})

describe('replaceWeekStatus', () => {
  it('replaces a week wholesale and touches no other week', () => {
    const db = emptyDb()
    replaceWeekStatus(db, 'L26', 1, statusRows('L26', 1, [roster(1, ['a'])], 'snapshot', { includeIr: true, includeTaxi: true }))
    replaceWeekStatus(db, 'L26', 2, statusRows('L26', 2, [roster(1, ['b'])], 'snapshot', { includeIr: true, includeTaxi: true }))
    replaceWeekStatus(db, 'L26', 2, statusRows('L26', 2, [roster(1, ['c'])], 'snapshot', { includeIr: true, includeTaxi: true }))
    expect(read(db).map((r) => [r.week, r.player_id])).toEqual([
      [1, 'a'],
      [2, 'c'],
    ])
  })
})

describe('syncRosterWeekStatus', () => {
  const weeks = [
    { week: 1, isFinal: true },
    { week: 2, isFinal: true },
    { week: 3, isFinal: false },
  ]

  it('snapshots the live week and infers taxi into the final ones', () => {
    const db = emptyDb()
    const out = syncRosterWeekStatus(db, {
      leagueId: 'L26',
      rosters: [roster(1, ['taxi1'], ['ir1'])],
      weeks,
      hasTaxiSquad: true,
    })
    expect(out).toEqual({ snapshotted: [3], inferred: [1, 2] })
    expect(read(db)).toEqual([
      { week: 1, player_id: 'taxi1', status: 'taxi', source: 'inferred' },
      { week: 2, player_id: 'taxi1', status: 'taxi', source: 'inferred' },
      { week: 3, player_id: 'ir1', status: 'ir', source: 'snapshot' },
      { week: 3, player_id: 'taxi1', status: 'taxi', source: 'snapshot' },
    ])
  })

  it('never overwrites a week that was snapshotted while it was live', () => {
    const db = emptyDb()
    // Week 2 was the live week last time round, and had a different taxi squad.
    syncRosterWeekStatus(db, {
      leagueId: 'L26',
      rosters: [roster(1, ['gone'])],
      weeks: [{ week: 1, isFinal: true }, { week: 2, isFinal: false }],
      hasTaxiSquad: true,
    })
    const out = syncRosterWeekStatus(db, {
      leagueId: 'L26',
      rosters: [roster(1, ['taxi1'])],
      weeks,
      hasTaxiSquad: true,
    })
    expect(out).toEqual({ snapshotted: [3], inferred: [1] })
    expect(read(db).filter((r) => r.week === 2)).toEqual([
      { week: 2, player_id: 'gone', status: 'taxi', source: 'snapshot' },
    ])
  })

  it('refreshes the inference as the taxi squad shrinks', () => {
    const db = emptyDb()
    const args = { leagueId: 'L26', weeks, hasTaxiSquad: true }
    syncRosterWeekStatus(db, { ...args, rosters: [roster(1, ['a', 'b'])] })
    syncRosterWeekStatus(db, { ...args, rosters: [roster(1, ['b'])] })
    expect(read(db).filter((r) => r.week === 1).map((r) => r.player_id)).toEqual(['b'])
  })

  it('infers nothing for a league with no taxi squad, but still snapshots IR', () => {
    const db = emptyDb()
    const out = syncRosterWeekStatus(db, {
      leagueId: 'L26',
      rosters: [roster(1, ['ignored'], ['ir1'])],
      weeks,
      hasTaxiSquad: false,
    })
    expect(out).toEqual({ snapshotted: [3], inferred: [] })
    expect(read(db)).toEqual([{ week: 3, player_id: 'ir1', status: 'ir', source: 'snapshot' }])
  })
})
