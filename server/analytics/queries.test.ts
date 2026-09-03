import { describe, expect, it, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getH2HGameLog,
  getH2HMatrix,
  getRecordsBook,
  getStandings,
  getTimeline,
} from './queries.js'
import type { DB } from '../db/index.js'

const migrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'db',
  'migrations',
)

function freshDb(): DB {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  for (const f of fs.readdirSync(migrationsDir).filter((x) => x.endsWith('.sql')).sort()) {
    db.exec(fs.readFileSync(path.join(migrationsDir, f), 'utf8'))
  }
  return db
}

/**
 * Minimal 2-manager, 2-season fixture:
 *   S1: A beats B twice (regular), A wins the final (playoff)  -> A champion
 *   S2: split 1-1
 */
function seed(db: DB): void {
  db.prepare(
    `INSERT INTO league_family (id, slug, display_name, league_type, current_league_id, sort_order)
     VALUES (1, 'test', 'Test League', 'redraft', 'L2', 1)`,
  ).run()
  const caps = JSON.stringify({ playoffTeams: 2, playoffWeekStart: 3 })
  db.prepare(
    `INSERT INTO league_season (league_id, family_id, season, status, total_rosters, capabilities_json)
     VALUES ('L1', 1, 2023, 'complete', 2, ?), ('L2', 1, 2024, 'complete', 2, ?)`,
  ).run(caps, caps)
  db.prepare(`INSERT INTO manager (user_id, display_name) VALUES ('A','Ada'), ('B','Bo')`).run()

  db.prepare(
    `INSERT INTO team_season (league_id, roster_id, user_id, wins, losses, ties, points_for, points_against, regular_season_rank, final_rank)
     VALUES ('L1',1,'A',2,0,0,300,200,1,1), ('L1',2,'B',0,2,0,200,300,2,2),
            ('L2',1,'A',1,1,0,200,210,2,2), ('L2',2,'B',1,1,0,210,200,1,1)`,
  ).run()

  const mk = db.prepare(
    `INSERT INTO matchup (league_id, week, matchup_id, roster_id, user_id, points, opponent_roster_id, opponent_user_id, opponent_points, result, is_playoff, is_consolation, median_result)
     VALUES (@lid,@wk,1,@r,@u,@p,@or,@ou,@op,@res,@po,0,@med)`,
  )
  const game = (lid: string, wk: number, aP: number, bP: number, playoff = 0) => {
    const aRes = aP > bP ? 'W' : aP < bP ? 'L' : 'T'
    const bRes = aRes === 'W' ? 'L' : aRes === 'L' ? 'W' : 'T'
    mk.run({ lid, wk, r: 1, u: 'A', p: aP, or: 2, ou: 'B', op: bP, res: aRes, po: playoff, med: aP > bP ? 'W' : 'L' })
    mk.run({ lid, wk, r: 2, u: 'B', p: bP, or: 1, ou: 'A', op: aP, res: bRes, po: playoff, med: bP > aP ? 'W' : 'L' })
  }
  game('L1', 1, 150, 100)
  game('L1', 2, 140, 110)
  game('L1', 3, 160, 130, 1) // playoff final
  game('L2', 1, 90, 120)
  game('L2', 2, 110, 90)
}

let db: DB
beforeEach(() => {
  db = freshDb()
  seed(db)
})

describe('getStandings', () => {
  it('aggregates career records, PPG and finishes', () => {
    const rows = getStandings(db, 'test')
    const ada = rows.find((r) => r.userId === 'A')!
    const bo = rows.find((r) => r.userId === 'B')!

    expect(ada.wins).toBe(4) // 3 in S1 + 1 in S2
    expect(ada.losses).toBe(1)
    expect(ada.seasons).toBe(2)
    expect(ada.championships).toBe(1)
    expect(bo.championships).toBe(1)
    expect(ada.playoffWins).toBe(1)
    expect(ada.regularSeasonWins).toBe(3)
    expect(ada.winPct).toBeCloseTo(0.8)
    expect(ada.ppg).toBeCloseTo((150 + 140 + 160 + 90 + 110) / 5)
    // sorted by winPct desc
    expect(rows[0].userId).toBe('A')
  })

  it('scopes to a single season', () => {
    const s2 = getStandings(db, 'test', 2024)
    expect(s2.find((r) => r.userId === 'A')!.wins).toBe(1)
    expect(s2.find((r) => r.userId === 'A')!.seasons).toBe(1)
  })
})

describe('getH2HMatrix / game log', () => {
  it('produces a symmetric combined record', () => {
    const m = getH2HMatrix(db, 'test')
    expect(m.cells.A.B.combined.wins).toBe(4)
    expect(m.cells.A.B.combined.losses).toBe(1)
    expect(m.cells.A.B.combined.meetings).toBe(5)
    expect(m.cells.B.A.combined.wins).toBe(1)
    expect(m.cells.B.A.combined.losses).toBe(4)
  })

  it('splits regular season and playoff meetings', () => {
    const m = getH2HMatrix(db, 'test')
    // A: 3-1 regular (wk1, wk2, L2 wk1 L, L2 wk2 W), 1-0 playoff (L1 wk3 final)
    expect(m.cells.A.B.regular).toMatchObject({ wins: 3, losses: 1, meetings: 4 })
    expect(m.cells.A.B.playoff).toMatchObject({ wins: 1, losses: 0, meetings: 1 })
    expect(m.cells.B.A.playoff).toMatchObject({ wins: 0, losses: 1 })
  })

  it('game log carries combined + split records', () => {
    const log = getH2HGameLog(db, 'test', 'A', 'B')
    expect(log.record.combined).toEqual({ wins: 4, losses: 1, ties: 0 })
    expect(log.record.regular).toEqual({ wins: 3, losses: 1, ties: 0 })
    expect(log.record.playoff).toEqual({ wins: 1, losses: 0, ties: 0 })
    expect(log.games).toHaveLength(5)
    expect(log.games[0]).toMatchObject({ season: 2023, week: 1, margin: 50 })
    expect(log.games[2]).toMatchObject({ week: 3, isPlayoff: true })
  })
})

describe('getRecordsBook', () => {
  it('finds the single-week high and biggest blowout', () => {
    const book = getRecordsBook(db, 'test')
    const high = book.find((r) => r.label === 'Highest single-week score')!
    expect(high.value).toBe(160)
    const blowout = book.find((r) => r.label === 'Biggest blowout')!
    expect(blowout.value).toBe(50) // A 150 - B 100
  })
})

describe('getTimeline', () => {
  it('maps season -> champion', () => {
    const t = getTimeline(db, 'test')
    expect(t.seasons).toEqual([2023, 2024])
    expect(t.champions[2023]).toBe('A')
    expect(t.champions[2024]).toBe('B')
    expect(t.ranks.A[2023]).toBe(1)
  })
})

describe('unknown / not-yet-ingested league', () => {
  it('every query returns an empty shape instead of throwing', () => {
    const empty = freshDb() // migrated, no data
    expect(() => getStandings(empty, 'nope')).not.toThrow()
    expect(getStandings(empty, 'nope')).toEqual([])
    expect(getH2HMatrix(empty, 'nope').managers).toEqual([])
    expect(getRecordsBook(empty, 'nope')).toEqual([])
    expect(getTimeline(empty, 'nope').seasons).toEqual([])
    expect(getH2HGameLog(empty, 'nope', 'x', 'y').games).toEqual([])
  })
})

/**
 * A blank family with a `game(season, week, aPts, bPts, opts)` writer, for the
 * records tests that need to control game type and data quality per week.
 */
type GameOpts = { playoff?: boolean; consolation?: boolean; unscored?: 'a' | 'b' | 'both' }

function customFixture(): {
  db: DB
  game: (season: number, week: number, a: number, b: number, opts?: GameOpts) => void
} {
  const db = freshDb()
  db.prepare(
    `INSERT INTO league_family (id, slug, display_name, league_type, current_league_id, sort_order)
     VALUES (1, 'test', 'Test League', 'redraft', 'L2024', 1)`,
  ).run()
  db.prepare(`INSERT INTO manager (user_id, display_name) VALUES ('A','Ada'), ('B','Bo')`).run()

  const seasons = new Set<number>()
  const mk = db.prepare(
    `INSERT INTO matchup (league_id, week, matchup_id, roster_id, user_id, points,
                          opponent_roster_id, opponent_user_id, opponent_points, result,
                          is_playoff, is_consolation, data_quality)
     VALUES (@lid,@wk,1,@r,@u,@p,@or,@ou,@op,@res,@po,@con,@dq)`,
  )

  const game = (
    season: number,
    week: number,
    aP: number,
    bP: number,
    opts: GameOpts = {},
  ) => {
    const lid = `L${season}`
    if (!seasons.has(season)) {
      db.prepare(
        `INSERT INTO league_season (league_id, family_id, season, status, total_rosters)
         VALUES (?, 1, ?, 'complete', 2)`,
      ).run(lid, season)
      seasons.add(season)
    }
    const aRes = aP > bP ? 'W' : aP < bP ? 'L' : 'T'
    const bRes = aRes === 'W' ? 'L' : aRes === 'L' ? 'W' : 'T'
    // Only the team whose lineup Sleeper lost is flagged — the opponent's own
    // score is real, which is the distinction the records book has to make.
    const flagged = (side: 'a' | 'b') =>
      opts.unscored === 'both' || opts.unscored === side ? 'unscored' : null
    const shared = {
      lid,
      wk: week,
      po: opts.playoff ? 1 : 0,
      con: opts.consolation ? 1 : 0,
    }
    mk.run({ ...shared, r: 1, u: 'A', p: aP, or: 2, ou: 'B', op: bP, res: aRes, dq: flagged('a') })
    mk.run({ ...shared, r: 2, u: 'B', p: bP, or: 1, ou: 'A', op: aP, res: bRes, dq: flagged('b') })
  }

  return { db, game }
}

describe('getRecordsBook — games Sleeper could not score', () => {
  it('drops a flagged score from the scoring records but keeps its opponent', () => {
    const { db: d, game } = customFixture()
    game(2024, 1, 120, 110)
    game(2024, 2, 130, 105)
    // Sleeper lost Bo's week-3 lineup: his 4 points and Ada's 150-point "blowout"
    // are both artefacts of that, but Ada's own 150 really happened.
    game(2024, 3, 150, 4, { unscored: 'b' })

    const book = getRecordsBook(d, 'test')
    expect(book.find((r) => r.label === 'Lowest single-week score')!.value).toBe(105)
    expect(book.find((r) => r.label === 'Biggest blowout')!.value).toBe(25)
    expect(book.find((r) => r.label === 'Highest single-week score')!.value).toBe(150)
  })

  it('explains how many games it left out', () => {
    const { db: d, game } = customFixture()
    game(2024, 1, 120, 110)
    game(2024, 2, 150, 4, { unscored: 'b' })
    const note = getRecordsBook(d, 'test').find((r) => r.note)
    expect(note?.value).toBe(1)
    expect(note?.note).toContain('1 game')
  })
})

describe('getRecordsBook — streaks', () => {
  it('carries a streak across a season boundary and reports the span', () => {
    const { db: d, game } = customFixture()
    game(2023, 12, 120, 100)
    game(2023, 13, 120, 100)
    game(2024, 1, 120, 100)
    const win = getRecordsBook(d, 'test').find((r) => r.label === 'Longest win streak')!
    expect(win.value).toBe(3)
    expect(win.userId).toBe('A')
    expect(win.span).toBe('2023 wk12 → 2024 wk1')
  })

  it('resets when a manager sits a season out', () => {
    const { db: d, game } = customFixture()
    game(2020, 1, 120, 100)
    game(2020, 2, 120, 100)
    // Nothing in 2021 or 2022 — the run does not bridge the gap.
    game(2023, 1, 120, 100)
    game(2023, 2, 120, 100)
    const win = getRecordsBook(d, 'test').find((r) => r.label === 'Longest win streak')!
    expect(win.value).toBe(2)
  })

  it('does not extend a streak through the consolation bracket', () => {
    const { db: d, game } = customFixture()
    game(2024, 1, 120, 100)
    game(2024, 2, 120, 100)
    game(2024, 3, 120, 100, { consolation: true })
    const win = getRecordsBook(d, 'test').find((r) => r.label === 'Longest win streak')!
    expect(win.value).toBe(2)
  })

  it('skips a lost week rather than breaking the streak on it', () => {
    const { db: d, game } = customFixture()
    game(2024, 1, 120, 100)
    game(2024, 2, 4, 150, { unscored: 'a' }) // Ada "loses" a phantom game
    game(2024, 3, 120, 100)
    const win = getRecordsBook(d, 'test').find((r) => r.label === 'Longest win streak')!
    expect(win.value).toBe(2)
    expect(win.userId).toBe('A')
  })

  it('reports no win streak when nobody has won', () => {
    const { db: d, game } = customFixture()
    game(2024, 1, 100, 100) // a tie
    const book = getRecordsBook(d, 'test')
    expect(book.find((r) => r.label === 'Longest win streak')).toBeUndefined()
    expect(book.find((r) => r.label === 'Longest losing streak')).toBeUndefined()
  })
})
