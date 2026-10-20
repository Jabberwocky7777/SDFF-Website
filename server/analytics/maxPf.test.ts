import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getMaxPfSeason, getMaxPfWeek, getMaxPfWeeks } from './maxPf.js'
import type { DB } from '../db/index.js'

const migrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'db',
  'migrations',
)

/**
 * Two teams, a QB/RB/WR lineup, one finished week and one still in progress.
 *
 *   r1 started q1 20 + rb1 10 + wr1 12 = 42. Its best RB is `taxi1` on 30 —
 *      a taxi player, so the taxi toggle changes its Max PF (62 → 57).
 *   r2 started q2 10 + rb3 12 + wr2 8 = 30, and left `ir1` on 20 on IR. IR
 *      players always count toward Max PF, so its max is 42 either way.
 */
function seededDb(): DB {
  const db = new Database(':memory:')
  for (const f of fs.readdirSync(migrationsDir).filter((x) => x.endsWith('.sql')).sort()) {
    db.exec(fs.readFileSync(path.join(migrationsDir, f), 'utf8'))
  }
  db.prepare(
    `INSERT INTO league_family (id, slug, display_name, league_type, current_league_id)
     VALUES (1,'d','D','dynasty','L26')`,
  ).run()
  db.prepare(
    `INSERT INTO league_season
       (league_id, family_id, season, status, playoff_week_start, playoff_teams,
        roster_positions_json, capabilities_json)
     VALUES ('L26',1,2026,'in_season',15,6,'["QB","RB","WR","BN","TAXI","IR"]','{"hasTaxiSquad":true}')`,
  ).run()

  const mgr = db.prepare(`INSERT INTO manager (user_id, display_name, avatar) VALUES (?,?,?)`)
  mgr.run('U1', 'Alice', 'av1')
  mgr.run('U2', 'Bob', null)
  const team = db.prepare(
    `INSERT INTO team_season (league_id, roster_id, user_id, team_name) VALUES ('L26',?,?,?)`,
  )
  team.run(1, 'U1', 'Taxi Cab Confessions')
  team.run(2, 'U2', null)

  const player = db.prepare(
    `INSERT INTO player (player_id, full_name, position, team) VALUES (?,?,?,?)`,
  )
  player.run('q1', 'Quinn One', 'QB', 'KC')
  player.run('rb1', 'Rob One', 'RB', 'SF')
  player.run('rb2', 'Rob Two', 'RB', 'DAL')
  player.run('wr1', 'Will One', 'WR', 'MIA')
  player.run('taxi1', 'Taz Rookie', 'RB', 'NYJ')
  player.run('q2', 'Quinn Two', 'QB', 'BUF')
  player.run('rb3', 'Rob Three', 'RB', 'DET')
  player.run('wr2', 'Will Two', 'WR', 'PHI')
  player.run('ir1', 'Irv Hurt', 'WR', 'LAR')

  const mk = db.prepare(
    `INSERT INTO matchup
       (league_id, week, matchup_id, roster_id, user_id, points, opponent_roster_id,
        opponent_points, result, starters_json, players_json, players_points_json, is_final)
     VALUES ('L26', @week, 1, @r, @u, @p, @opp, @oppP, @res, @sj, @pj, @ppj, @final)`,
  )
  const r1Players = '["q1","rb1","rb2","wr1","taxi1"]'
  const r1Points = '{"q1":20,"rb1":10,"rb2":25,"wr1":12,"taxi1":30}'
  const r2Players = '["q2","rb3","wr2","ir1"]'
  const r2Points = '{"q2":10,"rb3":12,"wr2":8,"ir1":20}'

  mk.run({
    week: 1, r: 1, u: 'U1', p: 42, opp: 2, oppP: 30, res: 'W',
    sj: '["q1","rb1","wr1"]', pj: r1Players, ppj: r1Points, final: 1,
  })
  mk.run({
    week: 1, r: 2, u: 'U2', p: 30, opp: 1, oppP: 42, res: 'L',
    sj: '["q2","rb3","wr2"]', pj: r2Players, ppj: r2Points, final: 1,
  })
  // Week 2 is still being played — nothing here should ever surface it.
  mk.run({
    week: 2, r: 1, u: 'U1', p: 11, opp: 2, oppP: 9, res: null,
    sj: '["q1","rb1","wr1"]', pj: r1Players, ppj: r1Points, final: 0,
  })
  mk.run({
    week: 2, r: 2, u: 'U2', p: 9, opp: 1, oppP: 11, res: null,
    sj: '["q2","rb3","wr2"]', pj: r2Players, ppj: r2Points, final: 0,
  })

  const status = db.prepare(
    `INSERT INTO roster_week_status (league_id, week, roster_id, player_id, status, source)
     VALUES ('L26', ?, ?, ?, ?, ?)`,
  )
  status.run(1, 1, 'taxi1', 'taxi', 'inferred')
  status.run(1, 2, 'ir1', 'ir', 'snapshot')
  return db
}

describe('getMaxPfWeeks', () => {
  it('lists finished weeks only', () => {
    expect(getMaxPfWeeks(seededDb(), 'd')).toEqual([
      { season: 2026, weeks: [1], playoffWeekStart: 15 },
    ])
  })

  it('is empty for an unknown league', () => {
    expect(getMaxPfWeeks(seededDb(), 'nope')).toEqual([])
  })
})

describe('getMaxPfWeek', () => {
  it('ranks by efficiency and names the best lineup', () => {
    const out = getMaxPfWeek(seededDb(), 'd', 2026, 1)!
    expect(out).toMatchObject({ season: 2026, week: 1, taxiIncluded: true, hasTaxiSquad: true })

    // r2 left 12 of 42 on the bench; r1 left 20 of 62. r2 is the more efficient.
    expect(out.teams.map((t) => t.rosterId)).toEqual([2, 1])

    const alice = out.teams.find((t) => t.rosterId === 1)!
    expect(alice).toMatchObject({
      name: 'Alice',
      teamName: 'Taxi Cab Confessions',
      avatar: 'av1',
      actual: 42,
      max: 62,
      leftOnBench: 20,
    })
    expect(alice.efficiency).toBeCloseTo(42 / 62, 4)
    expect(alice.bestLineup).toEqual([
      {
        slot: 'QB', playerId: 'q1', playerName: 'Quinn One', position: 'QB', nflTeam: 'KC',
        points: 20, startedActually: true, status: null,
      },
      {
        slot: 'RB', playerId: 'taxi1', playerName: 'Taz Rookie', position: 'RB', nflTeam: 'NYJ',
        points: 30, startedActually: false, status: 'taxi',
      },
      {
        slot: 'WR', playerId: 'wr1', playerName: 'Will One', position: 'WR', nflTeam: 'MIA',
        points: 12, startedActually: true, status: null,
      },
    ])
    expect(alice.shouldHaveSat).toEqual([
      {
        playerId: 'rb1', playerName: 'Rob One', position: 'RB', nflTeam: 'SF', points: 10,
      },
    ])
  })

  it('counts an IR player toward Max PF and badges him', () => {
    const out = getMaxPfWeek(seededDb(), 'd', 2026, 1)!
    const bob = out.teams.find((t) => t.rosterId === 2)!
    expect(bob).toMatchObject({ actual: 30, max: 42, leftOnBench: 12 })
    expect(bob.bestLineup[2]).toMatchObject({ playerId: 'ir1', status: 'ir', startedActually: false })
    expect(bob.shouldHaveSat.map((p) => p.playerId)).toEqual(['wr2'])
  })

  it('drops the taxi squad when asked, and leaves IR alone', () => {
    const out = getMaxPfWeek(seededDb(), 'd', 2026, 1, { includeTaxi: false })!
    expect(out.taxiIncluded).toBe(false)

    const alice = out.teams.find((t) => t.rosterId === 1)!
    // rb2 on 25 is the best RB he could legally have started.
    expect(alice).toMatchObject({ actual: 42, max: 57, leftOnBench: 15 })
    expect(alice.bestLineup[1]).toMatchObject({ playerId: 'rb2', status: null })

    const bob = out.teams.find((t) => t.rosterId === 2)!
    expect(bob.max).toBe(42)
  })

  it('reports the week’s biggest bench blunder', () => {
    const out = getMaxPfWeek(seededDb(), 'd', 2026, 1)!
    expect(out.blunder).toEqual({
      rosterId: 1, userId: 'U1', name: 'Alice', week: 1, leftOnBench: 20, actual: 42, max: 62,
    })
  })

  it('flags a week whose taxi record was inferred', () => {
    expect(getMaxPfWeek(seededDb(), 'd', 2026, 1)!.taxiInferred).toBe(true)
  })

  it('refuses a week in progress, an unknown season and an unknown league', () => {
    const db = seededDb()
    expect(getMaxPfWeek(db, 'd', 2026, 2)).toBeNull()
    expect(getMaxPfWeek(db, 'd', 2025, 1)).toBeNull()
    expect(getMaxPfWeek(db, 'nope', 2026, 1)).toBeNull()
  })
})

describe('getMaxPfSeason', () => {
  it('totals the finished weeks and keeps the worst single week', () => {
    const out = getMaxPfSeason(seededDb(), 'd', 2026)!
    expect(out).toMatchObject({ season: 2026, weeks: [1], taxiIncluded: true, taxiInferred: true })
    expect(out.teams.map((t) => [t.name, t.weeks, t.actual, t.max, t.leftOnBench])).toEqual([
      ['Bob', 1, 30, 42, 12],
      ['Alice', 1, 42, 62, 20],
    ])
    expect(out.blunder).toMatchObject({ name: 'Alice', week: 1, leftOnBench: 20 })
  })

  it('applies the taxi toggle to the season totals too', () => {
    const out = getMaxPfSeason(seededDb(), 'd', 2026, { includeTaxi: false })!
    expect(out.teams.find((t) => t.name === 'Alice')).toMatchObject({ max: 57, leftOnBench: 15 })
  })

  it('returns nothing for a season with no finished weeks', () => {
    expect(getMaxPfSeason(seededDb(), 'd', 2025)).toBeNull()
  })
})
