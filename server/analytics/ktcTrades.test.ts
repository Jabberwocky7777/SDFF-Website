/**
 * KTC value-at-trade and trade-balance tests.
 *
 * Two layers: the pure maths in `./ktc.ts` against a hand-built context, and
 * the same thing end to end through `getTradeDetail` with fixture rows in
 * `ktc_asset` / `ktc_value`.
 *
 * The cases that matter are the honest-failure ones — an unranked player, a
 * trade date outside the stored window, FAAB — because the rule the feature
 * rests on is that today's value never silently stands in for the trade-date
 * value.
 */
import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  balanceLabel,
  ktcBalance,
  loadKtcContext,
  valueOn,
  type KtcAssetValue,
} from './ktc.js'
import { getTradeDetail } from './trades.js'
import type { DB } from '../db/index.js'

const migrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'db',
  'migrations',
)

function migrate(db: DB): void {
  for (const f of fs.readdirSync(migrationsDir).filter((x) => x.endsWith('.sql')).sort()) {
    db.exec(fs.readFileSync(path.join(migrationsDir, f), 'utf8'))
  }
}

/** 2026-09-10 12:00 EDT — comfortably inside one calendar day in New York. */
const TRADE_MS = Date.UTC(2026, 8, 10, 16, 0, 0)
const TRADE_DATE = '2026-09-10'

function ktcAsset(
  db: DB,
  opts: {
    ktcId: number
    name: string
    position?: string
    playerId?: string | null
    pick?: { season: number; round: number; tier: string }
  },
): void {
  db.prepare(
    `INSERT INTO ktc_asset
       (ktc_id, slug, name, position, team, pick_season, pick_round, pick_tier,
        player_id, match_source, updated_at)
     VALUES (?,?,?,?,NULL,?,?,?,?,?,0)`,
  ).run(
    opts.ktcId,
    `slug-${opts.ktcId}`,
    opts.name,
    opts.position ?? (opts.pick ? 'RDP' : 'WR'),
    opts.pick?.season ?? null,
    opts.pick?.round ?? null,
    opts.pick?.tier ?? null,
    opts.playerId ?? null,
    opts.playerId ? 'auto' : null,
  )
}

function ktcValue(db: DB, ktcId: number, date: string, value: number): void {
  db.prepare(`INSERT INTO ktc_value (ktc_id, date, value, rank) VALUES (?,?,?,NULL)`).run(
    ktcId,
    date,
    value,
  )
}

// ── the pure layer ───────────────────────────────────────────────────────────

function ctxWith(rows: Array<[number, string, number]>) {
  const db = new Database(':memory:')
  migrate(db)
  const ids = new Set(rows.map(([id]) => id))
  for (const id of ids) ktcAsset(db, { ktcId: id, name: `A${id}`, playerId: `p${id}` })
  for (const [id, date, value] of rows) ktcValue(db, id, date, value)
  return loadKtcContext(db, [TRADE_DATE])
}

describe('valueOn', () => {
  it('takes the value stored on the trade date', () => {
    const ctx = ctxWith([
      [1, '2026-09-09', 5000],
      [1, TRADE_DATE, 5200],
    ])
    expect(valueOn(ctx, 1, TRADE_DATE)).toEqual({ date: TRADE_DATE, value: 5200 })
  })

  it('slides back to the nearest earlier day when KTC skipped one', () => {
    const ctx = ctxWith([[1, '2026-09-08', 4800]])
    expect(valueOn(ctx, 1, TRADE_DATE)).toEqual({ date: '2026-09-08', value: 4800 })
  })

  it('never reaches past the lookback window', () => {
    // Four days earlier — one day too far.
    const ctx = ctxWith([[1, '2026-09-06', 4800]])
    expect(valueOn(ctx, 1, TRADE_DATE)).toBeNull()
  })

  it('never looks forward', () => {
    const ctx = ctxWith([[1, '2026-09-11', 9999]])
    expect(valueOn(ctx, 1, TRADE_DATE)).toBeNull()
  })
})

describe('balanceLabel', () => {
  it('maps the percentage gap onto the label thresholds', () => {
    expect(balanceLabel(0)).toBe('even')
    expect(balanceLabel(4.9)).toBe('even')
    expect(balanceLabel(5)).toBe('slight')
    expect(balanceLabel(14.9)).toBe('slight')
    expect(balanceLabel(15)).toBe('clear')
    expect(balanceLabel(29.9)).toBe('clear')
    expect(balanceLabel(30)).toBe('lopsided')
    expect(balanceLabel(null)).toBeNull()
  })
})

describe('ktcBalance', () => {
  const v = (atTrade: number | null, now: number | null): KtcAssetValue => ({
    atTrade,
    atTradeDate: atTrade == null ? null : TRADE_DATE,
    now,
    nowDate: now == null ? null : TRADE_DATE,
    change: atTrade != null && now != null ? now - atTrade : null,
    changePct: null,
  })

  it('sums each side and reports the gap both ways', () => {
    const b = ktcBalance([
      { userId: 'A', assets: [v(6000, 7000)] },
      { userId: 'B', assets: [v(3000, 3500), v(1000, 1200)] },
    ])
    expect(b.sides.find((s) => s.userId === 'A')!.atTrade).toBe(6000)
    expect(b.sides.find((s) => s.userId === 'B')!.atTrade).toBe(4000)
    expect(b.gapAtTrade).toBe(2000)
    expect(b.gapPctAtTrade).toBeCloseTo(33.3, 1)
    expect(b.label).toBe('lopsided')
    expect(b.favoredUserId).toBe('A')
    expect(b.gapNow).toBe(2300)
    expect(b.incomplete).toBe(false)
  })

  it('measures a 3-team trade as the spread across every side', () => {
    const b = ktcBalance([
      { userId: 'A', assets: [v(5000, 5000)] },
      { userId: 'B', assets: [v(4800, 4800)] },
      { userId: 'C', assets: [v(4900, 4900)] },
    ])
    expect(b.sides).toHaveLength(3)
    expect(b.gapAtTrade).toBe(200) // 5000 − 4800, not a pair of differences
    expect(b.label).toBe('even')
    expect(b.favoredUserId).toBe('A')
  })

  it('flags an unpriceable asset instead of counting it as zero', () => {
    const b = ktcBalance([
      { userId: 'A', assets: [v(6000, 7000), v(null, 900)] },
      { userId: 'B', assets: [v(6100, 6200)] },
    ])
    expect(b.sides.find((s) => s.userId === 'A')!.atTrade).toBe(6000)
    expect(b.sides.find((s) => s.userId === 'A')!.missingAtTrade).toBe(1)
    expect(b.incomplete).toBe(true)
  })

  it('returns nulls rather than NaN when a side has nothing priceable', () => {
    const b = ktcBalance([
      { userId: 'A', assets: [null] },
      { userId: 'B', assets: [v(6100, 6200)] },
    ])
    expect(b.sides.find((s) => s.userId === 'A')!.atTrade).toBeNull()
    expect(b.gapAtTrade).toBeNull()
    expect(b.gapPctAtTrade).toBeNull()
    expect(b.label).toBeNull()
    expect(b.incomplete).toBe(true)
  })
})

// ── end to end through getTradeDetail ────────────────────────────────────────

/** Minimal dynasty family with one 2-team trade on TRADE_DATE. */
function seed(leagueType: 'dynasty' | 'redraft'): DB {
  const db = new Database(':memory:')
  migrate(db)
  db.prepare(
    `INSERT INTO league_family (id, slug, display_name, league_type, current_league_id)
     VALUES (1,'t','T',?,'L2026')`,
  ).run(leagueType)
  db.prepare(
    `INSERT INTO league_season (league_id, family_id, season, status) VALUES ('L2026',1,2026,'in_season')`,
  ).run()
  for (const [id, nm] of [['A', 'Alice'], ['B', 'Bob']]) {
    db.prepare(`INSERT INTO manager (user_id, display_name) VALUES (?,?)`).run(id, nm)
  }
  db.prepare(
    `INSERT INTO team_season (league_id, roster_id, user_id, team_name) VALUES ('L2026',1,'A','A'),('L2026',2,'B','B')`,
  ).run()
  for (const [pid, nm, pos] of [
    ['p1', 'Star WR', 'WR'],
    ['p2', 'Deep WR', 'WR'],
    ['p3', 'Rookie RB', 'RB'],
  ]) {
    db.prepare(`INSERT INTO player (player_id, full_name, position) VALUES (?,?,?)`).run(pid, nm, pos)
  }
  db.prepare(
    `INSERT INTO trade (id, league_id, family_id, season, week, created_ms, team_count, roster_ids_json, is_offseason)
     VALUES ('T1','L2026',1,2026,2,?,2,'[1,2]',0)`,
  ).run(TRADE_MS)
  return db
}

function asset(
  db: DB,
  row: {
    type: 'player' | 'pick' | 'faab'
    playerId?: string
    pickSeason?: number
    pickRound?: number
    pickFrom?: number
    faab?: number
    to: string
    from: string
  },
): void {
  db.prepare(
    `INSERT INTO trade_asset
       (trade_id, asset_type, player_id, pick_season, pick_round, pick_original_roster_id,
        faab_amount, from_roster_id, to_roster_id, from_user_id, to_user_id)
     VALUES ('T1',?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    row.type,
    row.playerId ?? null,
    row.pickSeason ?? null,
    row.pickRound ?? null,
    row.pickFrom ?? null,
    row.faab ?? null,
    row.from === 'A' ? 1 : 2,
    row.to === 'A' ? 1 : 2,
    row.from,
    row.to,
  )
}

describe('getTradeDetail — KTC fields', () => {
  it('reports then, now and the change for a matched player', () => {
    const db = seed('dynasty')
    asset(db, { type: 'player', playerId: 'p1', from: 'B', to: 'A' })
    asset(db, { type: 'player', playerId: 'p2', from: 'A', to: 'B' })
    ktcAsset(db, { ktcId: 10, name: 'Star WR', playerId: 'p1' })
    ktcAsset(db, { ktcId: 20, name: 'Deep WR', playerId: 'p2' })
    ktcValue(db, 10, TRADE_DATE, 6000)
    ktcValue(db, 10, '2026-10-20', 7500)
    ktcValue(db, 20, TRADE_DATE, 4000)
    ktcValue(db, 20, '2026-10-20', 3000)

    const t = getTradeDetail(db, 't', 'T1')!
    const alice = t.sides.find((s) => s.userId === 'A')!
    const star = alice.received[0]
    expect(star.ktc).toEqual({
      atTrade: 6000,
      atTradeDate: TRADE_DATE,
      now: 7500,
      nowDate: '2026-10-20',
      change: 1500,
      changePct: 25,
    })
    expect(alice.totals.ktcAtTrade).toBe(6000)
    expect(alice.totals.ktcNow).toBe(7500)

    expect(t.ktcBalance!.gapAtTrade).toBe(2000)
    expect(t.ktcBalance!.gapPctAtTrade).toBeCloseTo(33.3, 1)
    expect(t.ktcBalance!.label).toBe('lopsided')
    expect(t.ktcBalance!.favoredUserId).toBe('A')
    // Alice's side rose while Bob's fell, so the gap widened.
    expect(t.ktcBalance!.gapNow).toBe(4500)
  })

  it('leaves a player KTC has never ranked unpriced', () => {
    const db = seed('dynasty')
    asset(db, { type: 'player', playerId: 'p1', from: 'B', to: 'A' })
    asset(db, { type: 'player', playerId: 'p2', from: 'A', to: 'B' })
    ktcAsset(db, { ktcId: 10, name: 'Star WR', playerId: 'p1' })
    ktcValue(db, 10, TRADE_DATE, 6000)
    // p2 has no ktc_asset row at all.

    const t = getTradeDetail(db, 't', 'T1')!
    const bob = t.sides.find((s) => s.userId === 'B')!
    expect(bob.received[0].ktc).toBeNull()
    expect(bob.totals.ktcAtTrade).toBeNull()
    expect(t.ktcBalance!.incomplete).toBe(true)
    expect(t.ktcBalance!.gapAtTrade).toBeNull()
  })

  it('does not fall back to today when the trade predates stored history', () => {
    const db = seed('dynasty')
    asset(db, { type: 'player', playerId: 'p1', from: 'B', to: 'A' })
    ktcAsset(db, { ktcId: 10, name: 'Star WR', playerId: 'p1' })
    // Only a recent value — nothing anywhere near the trade date.
    ktcValue(db, 10, '2026-10-20', 7500)

    const star = getTradeDetail(db, 't', 'T1')!.sides.find((s) => s.userId === 'A')!.received[0]
    expect(star.ktc).toEqual({
      atTrade: null,
      atTradeDate: null,
      now: 7500,
      nowDate: '2026-10-20',
      change: null,
      changePct: null,
    })
  })

  it('prices a pick with KTC’s mid-tier asset, and its now value with the player drafted', () => {
    const db = seed('dynasty')
    asset(db, { type: 'pick', pickSeason: 2027, pickRound: 1, pickFrom: 2, from: 'B', to: 'A' })
    db.prepare(
      `INSERT INTO league_season (league_id, family_id, season, status, previous_league_id)
       VALUES ('L2027',1,2027,'in_season','L2026')`,
    ).run()
    db.prepare(
      `INSERT INTO draft_pick (draft_id, pick_no, league_id, season, round, roster_id, user_id, player_id, is_keeper)
       VALUES ('D2027',1,'L2027',2027,1,2,'A','p3',0)`,
    ).run()
    ktcAsset(db, {
      ktcId: 90,
      name: '2027 Mid 1st',
      pick: { season: 2027, round: 1, tier: 'mid' },
    })
    ktcAsset(db, { ktcId: 30, name: 'Rookie RB', position: 'RB', playerId: 'p3' })
    ktcValue(db, 90, TRADE_DATE, 5500)
    ktcValue(db, 30, '2026-10-20', 6200)

    const pick = getTradeDetail(db, 't', 'T1')!.sides.find((s) => s.userId === 'A')!.received[0]
    expect(pick.resolutionStatus).toBe('resolved')
    expect(pick.ktc).toMatchObject({ atTrade: 5500, now: 6200, change: 700 })
  })

  it('keeps an undrafted future pick on the pick’s own value', () => {
    const db = seed('dynasty')
    asset(db, { type: 'pick', pickSeason: 2028, pickRound: 1, pickFrom: 2, from: 'B', to: 'A' })
    ktcAsset(db, {
      ktcId: 91,
      name: '2028 Mid 1st',
      pick: { season: 2028, round: 1, tier: 'mid' },
    })
    ktcValue(db, 91, TRADE_DATE, 4800)
    ktcValue(db, 91, '2026-10-20', 4900)

    const pick = getTradeDetail(db, 't', 'T1')!.sides.find((s) => s.userId === 'A')!.received[0]
    expect(pick.resolutionStatus).toBe('pending')
    expect(pick.ktc).toMatchObject({ atTrade: 4800, now: 4900 })
  })

  it('excludes FAAB from the totals', () => {
    const db = seed('dynasty')
    asset(db, { type: 'player', playerId: 'p1', from: 'B', to: 'A' })
    asset(db, { type: 'faab', faab: 25, from: 'A', to: 'B' })
    ktcAsset(db, { ktcId: 10, name: 'Star WR', playerId: 'p1' })
    ktcValue(db, 10, TRADE_DATE, 6000)

    const t = getTradeDetail(db, 't', 'T1')!
    const bob = t.sides.find((s) => s.userId === 'B')!
    expect(bob.received[0].type).toBe('faab')
    expect(bob.received[0].ktc).toBeNull()
    expect(bob.totals.ktcAtTrade).toBeNull()
    expect(t.sides.find((s) => s.userId === 'A')!.totals.ktcAtTrade).toBe(6000)
  })

  it('handles a 3-team trade', () => {
    const db = seed('dynasty')
    db.prepare(`INSERT INTO manager (user_id, display_name) VALUES ('C','Cara')`).run()
    db.prepare(`UPDATE trade SET team_count = 3, roster_ids_json = '[1,2,3]' WHERE id = 'T1'`).run()
    db.prepare(
      `INSERT INTO team_season (league_id, roster_id, user_id, team_name) VALUES ('L2026',3,'C','C')`,
    ).run()
    db.prepare(
      `INSERT INTO trade_asset
         (trade_id, asset_type, player_id, from_roster_id, to_roster_id, from_user_id, to_user_id)
       VALUES ('T1','player','p1',2,1,'B','A'),
              ('T1','player','p2',3,2,'C','B'),
              ('T1','player','p3',1,3,'A','C')`,
    ).run()
    ktcAsset(db, { ktcId: 10, name: 'Star WR', playerId: 'p1' })
    ktcAsset(db, { ktcId: 20, name: 'Deep WR', playerId: 'p2' })
    ktcAsset(db, { ktcId: 30, name: 'Rookie RB', position: 'RB', playerId: 'p3' })
    ktcValue(db, 10, TRADE_DATE, 6000)
    ktcValue(db, 20, TRADE_DATE, 5000)
    ktcValue(db, 30, TRADE_DATE, 5900)

    const t = getTradeDetail(db, 't', 'T1')!
    expect(t.sides).toHaveLength(3)
    expect(t.ktcBalance!.sides).toHaveLength(3)
    expect(t.ktcBalance!.gapAtTrade).toBe(1000) // 6000 − 5000
    expect(t.ktcBalance!.favoredUserId).toBe('A')
    expect(t.ktcBalance!.label).toBe('clear')
  })

  it('omits KTC entirely for a redraft family', () => {
    const db = seed('redraft')
    asset(db, { type: 'player', playerId: 'p1', from: 'B', to: 'A' })
    ktcAsset(db, { ktcId: 10, name: 'Star WR', playerId: 'p1' })
    ktcValue(db, 10, TRADE_DATE, 6000)

    const t = getTradeDetail(db, 't', 'T1')!
    expect(t.ktcBalance).toBeNull()
    expect(t.sides[0].received[0].ktc).toBeNull()
    expect(t.sides[0].totals.ktcAtTrade).toBeNull()
  })
})
