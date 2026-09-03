import { describe, expect, it, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTradeDetail, getTradeFeed } from './trades.js'
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
     VALUES (1,'t','T','redraft','L2024')`,
  ).run()
  db.prepare(
    `INSERT INTO league_season (league_id, family_id, season, status, previous_league_id)
     VALUES ('L2023',1,2023,'complete',NULL), ('L2024',1,2024,'complete','L2023')`,
  ).run()
  for (const [id, nm] of [['A', 'Alice'], ['B', 'Bob']]) {
    db.prepare(`INSERT INTO manager (user_id, display_name) VALUES (?,?)`).run(id, nm)
  }
  // roster 1 = Alice, roster 2 = Bob, both seasons
  for (const lg of ['L2023', 'L2024']) {
    db.prepare(
      `INSERT INTO team_season (league_id, roster_id, user_id, team_name) VALUES (?,1,'A','Team A'),(?,2,'B','Team B')`,
    ).run(lg, lg)
  }
  for (const [pid, nm, pos] of [
    ['p1', 'Star WR', 'WR'],
    ['p2', 'Bust RB', 'RB'],
    ['r1', 'Repl WR', 'WR'],
    ['r2', 'Repl WR 2', 'WR'],
  ]) {
    db.prepare(
      `INSERT INTO player (player_id, full_name, position) VALUES (?,?,?)`,
    ).run(pid, nm, pos)
  }
  return db
}

function pwr(
  db: DB,
  leagueId: string,
  season: number,
  week: number,
  playerId: string,
  rosterId: number,
  userId: string,
  points: number,
  started: 0 | 1,
): void {
  db.prepare(
    `INSERT INTO player_week_roster (league_id, season, week, player_id, roster_id, user_id, points, started)
     VALUES (?,?,?,?,?,?,?,?)`,
  ).run(leagueId, season, week, playerId, rosterId, userId, points, started)
}

let db: DB
beforeEach(() => {
  db = freshDb()

  // Baseline so the WR replacement percentile is well-defined (~5 pts).
  for (let w = 1; w <= 8; w++) {
    pwr(db, 'L2024', 2024, w, 'r1', 2, 'B', 5, 1)
    pwr(db, 'L2024', 2024, w, 'r2', 1, 'A', 5, 1)
  }

  // Trade in 2024 week 5: Alice sends p2 (RB) to Bob, gets p1 (WR) from Bob.
  db.prepare(
    `INSERT INTO trade (id, league_id, family_id, season, week, created_ms, team_count, roster_ids_json, is_offseason)
     VALUES ('T1','L2024',1,2024,5,1000,2,'[1,2]',0)`,
  ).run()
  db.prepare(
    `INSERT INTO trade_asset (trade_id, asset_type, player_id, from_roster_id, to_roster_id, from_user_id, to_user_id)
     VALUES ('T1','player','p1',2,1,'B','A'), ('T1','player','p2',1,2,'A','B')`,
  ).run()

  // Weeks 1-4 (pre-trade): p1 on Bob, p2 on Alice — must NOT count.
  for (let w = 1; w <= 4; w++) {
    pwr(db, 'L2024', 2024, w, 'p1', 2, 'B', 30, 1)
    pwr(db, 'L2024', 2024, w, 'p2', 1, 'A', 3, 1)
  }
  // Weeks 5-8 (post-trade): p1 on Alice (starts, 20/wk), p2 on Bob (benched wk5, starts wk6-8 at 2/wk).
  for (let w = 5; w <= 8; w++) {
    pwr(db, 'L2024', 2024, w, 'p1', 1, 'A', 20, 1)
    pwr(db, 'L2024', 2024, w, 'p2', 2, 'B', 2, w === 5 ? 0 : 1)
  }
})

describe('getTradeFeed / getTradeDetail', () => {
  it('attributes only post-trade weeks to the receiver', () => {
    const t = getTradeDetail(db, 't', 'T1')!
    const alice = t.sides.find((s) => s.userId === 'A')!
    const bob = t.sides.find((s) => s.userId === 'B')!

    // Alice got p1: weeks 5-8 only = 4 × 20 = 80, all started.
    expect(alice.received).toHaveLength(1)
    expect(alice.received[0].pointsRostered).toBe(80)
    expect(alice.received[0].pointsStarted).toBe(80)
    expect(alice.received[0].weeksRostered).toBe(4)
    expect(alice.received[0].weeksStarted).toBe(4)

    // Bob got p2: weeks 5-8 rostered = 4 × 2 = 8; started weeks 6-8 = 6.
    expect(bob.received[0].pointsRostered).toBe(8)
    expect(bob.received[0].pointsStarted).toBe(6)
    expect(bob.received[0].weeksStarted).toBe(3)
  })

  it('PAR subtracts a replacement baseline from started points', () => {
    const t = getTradeDetail(db, 't', 'T1')!
    const alice = t.sides.find((s) => s.userId === 'A')!
    // Replacement WR ≈ 5 pts/wk; Alice started p1 4 weeks at 20 → PAR ≈ 80 − 4×5 = 60.
    expect(alice.received[0].par).toBeCloseTo(60, 0)
  })

  it('produces a directional headline and net differential', () => {
    const t = getTradeDetail(db, 't', 'T1')!
    // Alice +80 started, Bob +6 started → Alice ahead by 74.
    expect(t.netStartedDiff).toBeCloseTo(74)
    expect(t.headline.toLowerCase()).toContain('alice')
  })

  it('marks assets still on the roster in the latest snapshot', () => {
    const t = getTradeDetail(db, 't', 'T1')!
    const alice = t.sides.find((s) => s.userId === 'A')!
    const bob = t.sides.find((s) => s.userId === 'B')!
    // Latest snapshot is 2024 wk8: p1 on Alice, p2 on Bob → both still rostered.
    expect(alice.received[0].stillRostered).toBe(true)
    expect(bob.received[0].stillRostered).toBe(true)
    expect(alice.totals.assetsStillRostered).toBe(1)
  })

  it('feed lists the family trades, newest first', () => {
    const feed = getTradeFeed(db, 't')
    expect(feed).toHaveLength(1)
    expect(feed[0].id).toBe('T1')
    expect(getTradeFeed(db, 't', { season: 2023 })).toHaveLength(0)
    expect(getTradeFeed(db, 't', { userId: 'A' })).toHaveLength(1)
    expect(getTradeFeed(db, 't', { userId: 'nobody' })).toHaveLength(0)
  })

  it('returns [] for an unknown league and null for an unknown trade', () => {
    expect(getTradeFeed(db, 'nope')).toEqual([])
    expect(getTradeDetail(db, 't', 'nope')).toBeNull()
  })
})
