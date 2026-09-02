import { describe, expect, it, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getAllPlay } from './allplay.js'
import type { DB } from '../db/index.js'

const migrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'db',
  'migrations',
)

function freshDb(): DB {
  const db = new Database(':memory:')
  for (const f of fs.readdirSync(migrationsDir).filter((x) => x.endsWith('.sql')).sort()) {
    db.exec(fs.readFileSync(path.join(migrationsDir, f), 'utf8'))
  }
  db.prepare(
    `INSERT INTO league_family (id, slug, display_name, league_type, current_league_id)
     VALUES (1,'t','T','redraft','L1')`,
  ).run()
  db.prepare(
    `INSERT INTO league_season (league_id, family_id, season, status) VALUES ('L1',1,2024,'complete')`,
  ).run()
  for (const [id, nm] of [['A', 'A'], ['B', 'B'], ['C', 'C'], ['D', 'D']]) {
    db.prepare(`INSERT INTO manager (user_id, display_name) VALUES (?,?)`).run(id, nm)
  }
  return db
}

/**
 * One week, 4 teams. Scores A=100, B=90, C=80, D=70.
 * Actual schedule: A beats D, B beats C.
 * All-play: A 3-0, B 2-1, C 1-2, D 0-3.
 * A is 1-0 actual but "should" be 1.0 expected wins (3/3) -> luck ~0.
 * D is 0-1 actual, expected 0 -> luck 0. B actual 1-0, expected 2/3 -> +0.33 lucky.
 */
function seedOneWeek(db: DB): void {
  const mk = db.prepare(
    `INSERT INTO matchup (league_id,week,matchup_id,roster_id,user_id,points,opponent_roster_id,opponent_user_id,opponent_points,result,is_playoff,is_consolation)
     VALUES ('L1',1,@mid,@r,@u,@p,@or,@ou,@op,@res,0,0)`,
  )
  mk.run({ mid: 1, r: 1, u: 'A', p: 100, or: 4, ou: 'D', op: 70, res: 'W' })
  mk.run({ mid: 1, r: 4, u: 'D', p: 70, or: 1, ou: 'A', op: 100, res: 'L' })
  mk.run({ mid: 2, r: 2, u: 'B', p: 90, or: 3, ou: 'C', op: 80, res: 'W' })
  mk.run({ mid: 2, r: 3, u: 'C', p: 80, or: 2, ou: 'B', op: 90, res: 'L' })
}

let db: DB
beforeEach(() => {
  db = freshDb()
  seedOneWeek(db)
})

describe('getAllPlay', () => {
  it('computes all-play records against the whole field', () => {
    const rows = getAllPlay(db, 't')
    const byId = Object.fromEntries(rows.map((r) => [r.userId, r]))

    expect(byId.A.allPlayWins).toBe(3)
    expect(byId.A.allPlayLosses).toBe(0)
    expect(byId.D.allPlayWins).toBe(0)
    expect(byId.D.allPlayLosses).toBe(3)
    expect(byId.B.allPlayWins).toBe(2)
    expect(byId.C.allPlayWins).toBe(1)
  })

  it('expected wins sum to total games and luck reflects schedule', () => {
    const rows = getAllPlay(db, 't')
    const byId = Object.fromEntries(rows.map((r) => [r.userId, r]))

    const totalExpected = rows.reduce((s, r) => s + r.expectedWins, 0)
    expect(totalExpected).toBeCloseTo(2) // 2 actual games this week

    expect(byId.A.expectedWins).toBeCloseTo(1)
    expect(byId.B.expectedWins).toBeCloseTo(2 / 3)
    expect(byId.B.scheduleLuck).toBeCloseTo(1 - 2 / 3) // won, "should" have 0.67
    expect(byId.C.scheduleLuck).toBeCloseTo(0 - 1 / 3)
  })

  it('points above median is symmetric around zero', () => {
    const rows = getAllPlay(db, 't')
    const total = rows.reduce((s, r) => s + r.pointsAboveMedian, 0)
    expect(total).toBeCloseTo(0)
  })
})
