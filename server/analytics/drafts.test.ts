import { describe, expect, it, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDraftBoard, getDraftSeasons } from './drafts.js'
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
  return db
}

/** 4-team, 3-round snake draft in 2024. Roster slots: 1,2,3,4. Roster 4 traded
 *  its round-1 pick to roster 1 (roster 1 made pick 4). */
function seed(db: DB): void {
  db.prepare(
    `INSERT INTO league_family (id, slug, display_name, league_type, current_league_id)
     VALUES (1,'d','D','redraft','L24')`,
  ).run()
  db.prepare(
    `INSERT INTO league_season (league_id, family_id, season, status) VALUES ('L24',1,2024,'complete')`,
  ).run()
  for (const [rid, u, nm] of [[1, 'u1', 'One'], [2, 'u2', 'Two'], [3, 'u3', 'Three'], [4, 'u4', 'Four']] as const) {
    db.prepare(`INSERT INTO manager (user_id, display_name) VALUES (?,?)`).run(u, nm)
    db.prepare(
      `INSERT INTO team_season (league_id, roster_id, user_id, team_name) VALUES ('L24',?,?,?)`,
    ).run(rid, u, `Team ${nm}`)
  }
  for (let i = 1; i <= 12; i++) {
    db.prepare(`INSERT INTO player (player_id, full_name, position, team) VALUES (?,?,?,?)`).run(
      `p${i}`,
      `Player ${i}`,
      'RB',
      'FA',
    )
  }
  // pick_no, round, slot-roster, picked_by
  const rows: Array<[number, number, number, string]> = [
    [1, 1, 1, 'u1'],
    [2, 1, 2, 'u2'],
    [3, 1, 3, 'u3'],
    [4, 1, 4, 'u1'], // roster 4's slot, but u1 picked (traded)
    [5, 2, 4, 'u4'],
    [6, 2, 3, 'u3'],
    [7, 2, 2, 'u2'],
    [8, 2, 1, 'u1'],
    [9, 3, 1, 'u1'],
    [10, 3, 2, 'u2'],
    [11, 3, 3, 'u3'],
    [12, 3, 4, 'u4'],
  ]
  const stmt = db.prepare(
    `INSERT INTO draft_pick (draft_id, pick_no, league_id, season, round, roster_id, user_id, player_id, is_keeper)
     VALUES ('DR1', @pn, 'L24', 2024, @rd, @rid, @uid, @pid, 0)`,
  )
  rows.forEach(([pn, rd, rid, uid], i) => stmt.run({ pn, rd, rid, uid, pid: `p${i + 1}` }))
}

let db: DB
beforeEach(() => {
  db = freshDb()
  seed(db)
})

describe('getDraftSeasons', () => {
  it('summarizes each draft', () => {
    const s = getDraftSeasons(db, 'd')
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ season: 2024, rounds: 3, teams: 4, totalPicks: 12 })
  })
  it('empty for unknown league', () => {
    expect(getDraftSeasons(db, 'nope')).toEqual([])
  })
})

describe('getDraftBoard', () => {
  it('assigns columns by first-pick order and lists every pick', () => {
    const b = getDraftBoard(db, 'd', 2024)!
    expect(b.teams).toBe(4)
    expect(b.picks).toHaveLength(12)
    expect(b.slots.map((s) => s.rosterId)).toEqual([1, 2, 3, 4])
    expect(b.slots[0].name).toBe('Team One')
  })

  it('flags a pick made by someone other than the slot owner', () => {
    const b = getDraftBoard(db, 'd', 2024)!
    const p4 = b.picks.find((p) => p.pickNo === 4)!
    expect(p4.slot).toBe(4)
    expect(p4.managerName).toBe('One')
    expect(p4.viaTrade).toBe(true)
    const p1 = b.picks.find((p) => p.pickNo === 1)!
    expect(p1.viaTrade).toBe(false)
  })

  it('returns null for a season with no draft', () => {
    expect(getDraftBoard(db, 'd', 2019)).toBeNull()
    expect(getDraftBoard(db, 'nope', 2024)).toBeNull()
  })
})
