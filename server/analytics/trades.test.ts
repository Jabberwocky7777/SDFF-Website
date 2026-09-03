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

function runMigrations(db: DB): void {
  for (const f of fs.readdirSync(migrationsDir).filter((x) => x.endsWith('.sql')).sort()) {
    db.exec(fs.readFileSync(path.join(migrationsDir, f), 'utf8'))
  }
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

/** One team's side of a game. Attribution only counts weeks a team played. */
function game(
  db: DB,
  leagueId: string,
  week: number,
  rosterId: number,
  userId: string,
  opts: { playoff?: boolean; consolation?: boolean; quality?: string | null } = {},
): void {
  db.prepare(
    `INSERT INTO matchup (league_id, week, matchup_id, roster_id, user_id, points,
                          opponent_roster_id, opponent_user_id, opponent_points, result,
                          is_playoff, is_consolation, data_quality)
     VALUES (?,?,1,?,?,100,?,?,90,'W',?,?,?)`,
  ).run(
    leagueId,
    week,
    rosterId,
    userId,
    rosterId === 1 ? 2 : 1,
    userId === 'A' ? 'B' : 'A',
    opts.playoff ? 1 : 0,
    opts.consolation ? 1 : 0,
    opts.quality ?? null,
  )
}

/**
 * Two seasons (2024, 2025), rosters 1=Alice 2=Bob, players p1/p2 + WR baseline.
 *
 * Each season runs weeks 1-8 regular, week 9 playoffs (Alice in the winners
 * bracket, Bob in consolation), and week 10 a week whose scores Sleeper lost.
 */
function seedFamily(db: DB, leagueType: 'redraft' | 'dynasty'): DB {
  db.prepare(
    `INSERT INTO league_family (id, slug, display_name, league_type, current_league_id)
     VALUES (1,'t','T',?,'L2025')`,
  ).run(leagueType)
  db.prepare(
    `INSERT INTO league_season (league_id, family_id, season, status, previous_league_id)
     VALUES ('L2024',1,2024,'complete',NULL), ('L2025',1,2025,'complete','L2024')`,
  ).run()
  for (const [id, nm] of [['A', 'Alice'], ['B', 'Bob']]) {
    db.prepare(`INSERT INTO manager (user_id, display_name) VALUES (?,?)`).run(id, nm)
  }
  for (const lg of ['L2024', 'L2025']) {
    db.prepare(
      `INSERT INTO team_season (league_id, roster_id, user_id, team_name) VALUES (?,1,'A','A'),(?,2,'B','B')`,
    ).run(lg, lg)
  }
  for (const [pid, nm, pos] of [
    ['p1', 'Star WR', 'WR'],
    ['p2', 'Bust RB', 'RB'],
    ['r1', 'Repl WR', 'WR'],
  ]) {
    db.prepare(`INSERT INTO player (player_id, full_name, position) VALUES (?,?,?)`).run(pid, nm, pos)
  }

  for (const lg of ['L2024', 'L2025']) {
    for (let w = 1; w <= 8; w++) {
      game(db, lg, w, 1, 'A')
      game(db, lg, w, 2, 'B')
    }
    game(db, lg, 9, 1, 'A', { playoff: true })
    game(db, lg, 9, 2, 'B', { consolation: true })
    game(db, lg, 10, 1, 'A', { quality: 'unscored' })
    game(db, lg, 10, 2, 'B', { quality: 'unscored' })
  }

  // WR replacement baseline ≈ 5.
  for (const [lg, sn] of [['L2024', 2024], ['L2025', 2025]] as const) {
    for (let w = 1; w <= 8; w++) pwr(db, lg, sn, w, 'r1', 2, 'B', 5, 1)
  }

  // Trade in 2024 week 5: Alice gets p1 from Bob, Bob gets p2 from Alice.
  db.prepare(
    `INSERT INTO trade (id, league_id, family_id, season, week, created_ms, team_count, roster_ids_json, is_offseason)
     VALUES ('T1','L2024',1,2024,5,1000,2,'[1,2]',0)`,
  ).run()
  db.prepare(
    `INSERT INTO trade_asset (trade_id, asset_type, player_id, from_roster_id, to_roster_id, from_user_id, to_user_id)
     VALUES ('T1','player','p1',2,1,'B','A'), ('T1','player','p2',1,2,'A','B')`,
  ).run()

  // Pre-trade weeks 1-4 (must NOT count).
  for (let w = 1; w <= 4; w++) {
    pwr(db, 'L2024', 2024, w, 'p1', 2, 'B', 30, 1)
  }
  // 2024 weeks 5-8: p1 on Alice, starts, 20/wk. Week 9 is a playoff game (40),
  // week 10 is the lost week (1000, must be ignored).
  for (let w = 5; w <= 8; w++) pwr(db, 'L2024', 2024, w, 'p1', 1, 'A', 20, 1)
  pwr(db, 'L2024', 2024, 9, 'p1', 1, 'A', 40, 1)
  pwr(db, 'L2024', 2024, 10, 'p1', 1, 'A', 1000, 1)
  // Bob's return: 10/wk in the regular season, plus a big consolation week that
  // must not count as value delivered.
  for (let w = 5; w <= 8; w++) pwr(db, 'L2024', 2024, w, 'p2', 2, 'B', 10, 1)
  pwr(db, 'L2024', 2024, 9, 'p2', 2, 'B', 99, 1)
  // 2025 weeks 1-8: p1 STILL on Alice (dynasty keeps him), starts, 25/wk.
  for (let w = 1; w <= 8; w++) pwr(db, 'L2025', 2025, w, 'p1', 1, 'A', 25, 1)
  return db
}

function fresh(leagueType: 'redraft' | 'dynasty'): DB {
  const db = new Database(':memory:')
  runMigrations(db)
  return seedFamily(db, leagueType)
}

describe('getTradeDetail — redraft caps at the trade season', () => {
  let db: DB
  beforeEach(() => {
    db = fresh('redraft')
  })

  it('counts only the trade season, ignoring later years', () => {
    const t = getTradeDetail(db, 't', 'T1')!
    expect(t.multiSeason).toBe(false)
    const alice = t.sides.find((s) => s.userId === 'A')!
    // 2024 wk5-8 (4 × 20) + the wk9 playoff game (40). NOT the 2025 points.
    expect(alice.totals.pointsStarted).toBe(120)
    expect(alice.bySeason).toHaveLength(1)
    expect(alice.bySeason[0].season).toBe(2024)
    expect(alice.bySeason[0].pointsStarted).toBe(120)
  })

  it('splits the return into regular season and playoffs', () => {
    const alice = getTradeDetail(db, 't', 'T1')!.sides.find((s) => s.userId === 'A')!
    expect(alice.bySeason[0].regularStarted).toBe(80)
    expect(alice.bySeason[0].playoffStarted).toBe(40)
    expect(alice.totals.regularStarted).toBe(80)
    expect(alice.totals.playoffStarted).toBe(40)
  })

  it('ignores consolation-bracket weeks', () => {
    const bob = getTradeDetail(db, 't', 'T1')!.sides.find((s) => s.userId === 'B')!
    // 4 × 10 regular. The 99-point consolation week is not a return on a trade.
    expect(bob.totals.pointsStarted).toBe(40)
    expect(bob.totals.playoffStarted).toBe(0)
  })

  it('ignores weeks whose scores Sleeper lost', () => {
    const alice = getTradeDetail(db, 't', 'T1')!.sides.find((s) => s.userId === 'A')!
    // The week-10 row is worth 1000 points and is flagged 'unscored'.
    expect(alice.totals.pointsStarted).toBeLessThan(1000)
    expect(alice.bySeason[0].weeksStarted).toBe(5)
  })

  it('PAR subtracts a replacement baseline', () => {
    const alice = getTradeDetail(db, 't', 'T1')!.sides.find((s) => s.userId === 'A')!
    // 120 − 5 × ~5 ≈ 95.
    expect(alice.bySeason[0].par).toBeCloseTo(95, 0)
  })
})

describe('getTradeDetail — dynasty follows the asset across seasons', () => {
  let db: DB
  beforeEach(() => {
    db = fresh('dynasty')
  })

  it('breaks the return out per season', () => {
    const t = getTradeDetail(db, 't', 'T1')!
    expect(t.multiSeason).toBe(true)
    const alice = t.sides.find((s) => s.userId === 'A')!
    expect(alice.bySeason.map((l) => l.season)).toEqual([2024, 2025])
    expect(alice.bySeason[0].pointsStarted).toBe(120) // 2024: 4 × 20 + 40 playoff
    expect(alice.bySeason[1].pointsStarted).toBe(200) // 2025: 8 × 25
    expect(alice.totals.pointsStarted).toBe(320) // grand total
  })

  it('headline compares grand started points', () => {
    const t = getTradeDetail(db, 't', 'T1')!
    expect(t.netStartedDiff).toBeCloseTo(280) // Alice 320, Bob 40
    expect(t.headline.toLowerCase()).toContain('alice')
  })
})

describe('getTradeDetail — picks cashed in a later season', () => {
  it('counts the rookie season from week 1, not the trade week', () => {
    const db = fresh('dynasty')
    // Alice trades for Bob's 2025 1st in 2024 week 5. It becomes p3, who scores
    // from week 1 of 2025 — weeks 1-4 must not be dropped because of week 5.
    db.prepare(`INSERT INTO player (player_id, full_name, position) VALUES ('p3','Rookie RB','RB')`).run()
    db.prepare(
      `INSERT INTO draft_pick (league_id, draft_id, season, pick_no, round, roster_id, user_id, player_id, is_keeper)
       VALUES ('L2025','D2025',2025,1,1,2,'A','p3',0)`,
    ).run()
    db.prepare(
      `INSERT INTO trade_asset (trade_id, asset_type, pick_season, pick_round, pick_original_roster_id, from_user_id, to_user_id)
       VALUES ('T1','pick',2025,1,2,'B','A')`,
    ).run()
    for (let w = 1; w <= 8; w++) pwr(db, 'L2025', 2025, w, 'p3', 1, 'A', 10, 1)

    const alice = getTradeDetail(db, 't', 'T1')!.sides.find((s) => s.userId === 'A')!
    const pick = alice.received.find((r) => r.type === 'pick')!
    expect(pick.resolutionStatus).toBe('resolved')
    expect(pick.pointsStarted).toBe(80) // all eight weeks, not weeks 5-8
  })
})

describe('getTradeFeed', () => {
  it('lists family trades and filters', () => {
    const db = fresh('redraft')
    expect(getTradeFeed(db, 't')).toHaveLength(1)
    expect(getTradeFeed(db, 't', { season: 2023 })).toHaveLength(0)
    expect(getTradeFeed(db, 't', { userId: 'A' })).toHaveLength(1)
    expect(getTradeFeed(db, 't', { userId: 'nobody' })).toHaveLength(0)
  })

  it('returns [] / null for unknowns', () => {
    const db = fresh('redraft')
    expect(getTradeFeed(db, 'nope')).toEqual([])
    expect(getTradeDetail(db, 't', 'nope')).toBeNull()
  })
})
