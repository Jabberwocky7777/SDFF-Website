/**
 * The week in progress is stored (the Matchups scoreboard shows it live), but
 * no history view may count it. Two finished weeks where A beats B, then a live
 * week 3 where B is crushing A: every history number must read as if week 3
 * hadn't happened yet.
 */
import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getH2HGameLog, getH2HMatrix, getRecordsBook, getStandings } from './queries.js'
import { getAllPlay } from './allplay.js'
import { getPowerRankings } from './powerRankings.js'
import { getWeekMatchups } from './matchups.js'
import type { DB } from '../db/index.js'

const migrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'db',
  'migrations',
)

function seeded(): DB {
  const db = new Database(':memory:')
  for (const f of fs.readdirSync(migrationsDir).filter((x) => x.endsWith('.sql')).sort()) {
    db.exec(fs.readFileSync(path.join(migrationsDir, f), 'utf8'))
  }
  db.prepare(
    `INSERT INTO league_family (id, slug, display_name, league_type, current_league_id)
     VALUES (1,'t','T','redraft','L1')`,
  ).run()
  db.prepare(
    `INSERT INTO league_season (league_id, family_id, season, status, playoff_week_start)
     VALUES ('L1',1,2026,'in_season',15)`,
  ).run()
  db.prepare(`INSERT INTO manager (user_id, display_name) VALUES ('A','A'), ('B','B')`).run()

  const mk = db.prepare(
    `INSERT INTO matchup (league_id, week, matchup_id, roster_id, user_id, points,
                          opponent_roster_id, opponent_user_id, opponent_points, result, is_final)
     VALUES ('L1', @w, 1, @r, @u, @p, @or, @ou, @op, @res, @fin)`,
  )
  const game = (w: number, a: number, b: number, final: boolean) => {
    const res = (x: number, y: number) => (final ? (x > y ? 'W' : 'L') : null)
    const fin = final ? 1 : 0
    mk.run({ w, r: 1, u: 'A', p: a, or: 2, ou: 'B', op: b, res: res(a, b), fin })
    mk.run({ w, r: 2, u: 'B', p: b, or: 1, ou: 'A', op: a, res: res(b, a), fin })
  }
  game(1, 120, 100, true)
  game(2, 110, 90, true)
  game(3, 20, 400, false) // live: B is mid-blowout
  return db
}

describe('history views skip the week in progress', () => {
  it('standings', () => {
    const rows = getStandings(seeded(), 't')
    const a = rows.find((r) => r.userId === 'A')!
    const b = rows.find((r) => r.userId === 'B')!
    expect([a.wins, a.losses, a.pointsFor]).toEqual([2, 0, 230])
    expect([b.wins, b.losses, b.pointsFor]).toEqual([0, 2, 190])
  })

  it('head-to-head matrix and game log', () => {
    const db = seeded()
    expect(getH2HMatrix(db, 't').cells.A.B.combined).toMatchObject({ wins: 2, losses: 0 })
    expect(getH2HGameLog(db, 't', 'A', 'B').games.map((g) => g.week)).toEqual([1, 2])
  })

  it('records book never sees the live 400', () => {
    const json = JSON.stringify(getRecordsBook(seeded(), 't'))
    expect(json).not.toContain('400')
  })

  it('all-play and power rankings', () => {
    const db = seeded()
    expect(getAllPlay(db, 't').find((r) => r.userId === 'A')).toMatchObject({ weeks: 2, actualWins: 2 })
    const power = getPowerRankings(db, 't')
    expect(power.throughWeek).toBe(2)
    expect(power.rankings[0].userId).toBe('A')
  })

  it('the scoreboard still shows the live week, as not final', () => {
    const db = seeded()
    const live = getWeekMatchups(db, 't', 2026, 3).games[0]
    expect(live.final).toBe(false)
    expect(live.home.points + (live.away?.points ?? 0)).toBe(420)
    expect(live.h2h).toMatchObject({ meetings: 2 })
    expect(getWeekMatchups(db, 't', 2026, 2).games[0].final).toBe(true)
  })
})
