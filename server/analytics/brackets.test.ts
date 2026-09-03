import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getBracketSeasons, getSeasonBracket } from './brackets.js'
import type { DB } from '../db/index.js'

const migrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'db',
  'migrations',
)

function freshDb(): DB {
  const db = new Database(':memory:')
  for (const f of fs
    .readdirSync(migrationsDir)
    .filter((x) => x.endsWith('.sql'))
    .sort()) {
    db.exec(fs.readFileSync(path.join(migrationsDir, f), 'utf8'))
  }
  return db
}

interface MatchSpec {
  matchId: number
  round: number
  t1: number | null
  t2: number | null
  w: number | null
  l?: number | null
  p?: number | null
  t1From?: string | null
  t2From?: string | null
}

function addBracket(
  db: DB,
  leagueId: string,
  bracket: 'winners' | 'losers',
  matches: MatchSpec[],
): void {
  for (const m of matches) {
    db.prepare(
      `INSERT INTO playoff_bracket (league_id, bracket, match_id, round, t1_roster_id,
         t2_roster_id, winner_roster_id, loser_roster_id, placement, t1_from_json, t2_from_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      leagueId,
      bracket,
      m.matchId,
      m.round,
      m.t1,
      m.t2,
      m.w,
      m.l ?? null,
      m.p ?? null,
      m.t1From ?? null,
      m.t2From ?? null,
    )
  }
}

/**
 * A 4-team bracket in 2025 (playoffs from week 15), plus an untouched 2026
 * league carrying the empty skeleton Sleeper hands back before a season runs.
 *
 * Rosters 1..4 in 2025 belong to Ana/Bo/Cy/Dee. In 2026 the same roster ids
 * belong to different managers — the cross-season trap this module must avoid.
 */
function seed(db: DB): void {
  db.prepare(
    `INSERT INTO league_family (id, slug, display_name, league_type, current_league_id)
     VALUES (1,'d','D','redraft','L26')`,
  ).run()
  db.prepare(
    `INSERT INTO league_season (league_id, family_id, season, status, playoff_week_start)
     VALUES ('L25',1,2025,'complete',15)`,
  ).run()
  db.prepare(
    `INSERT INTO league_season (league_id, family_id, season, status, playoff_week_start)
     VALUES ('L26',1,2026,'pre_draft',15)`,
  ).run()

  for (const [u, name] of [
    ['a', 'Ana'],
    ['b', 'Bo'],
    ['c', 'Cy'],
    ['d', 'Dee'],
  ] as const) {
    db.prepare(`INSERT INTO manager (user_id, display_name) VALUES (?,?)`).run(u, name)
  }

  // 2025 seeding: Ana 1, Bo 2, Cy 3, Dee 4.
  for (const [rid, u, seedRank] of [
    [1, 'a', 1],
    [2, 'b', 2],
    [3, 'c', 3],
    [4, 'd', 4],
  ] as const) {
    db.prepare(
      `INSERT INTO team_season (league_id, roster_id, user_id, team_name, regular_season_rank)
       VALUES ('L25',?,?,?,?)`,
    ).run(rid, u, `Team ${u.toUpperCase()}`, seedRank)
  }
  // 2026: the same roster numbers, shuffled between managers.
  for (const [rid, u] of [
    [1, 'd'],
    [2, 'c'],
    [3, 'b'],
    [4, 'a'],
  ] as const) {
    db.prepare(
      `INSERT INTO team_season (league_id, roster_id, user_id, regular_season_rank)
       VALUES ('L26',?,?,1)`,
    ).run(rid, u)
  }

  // Semi-final week 15 scores, then the final in week 16.
  const score = db.prepare(
    `INSERT INTO matchup (league_id, week, roster_id, points) VALUES (?,?,?,?)`,
  )
  score.run('L25', 15, 1, 120)
  score.run('L25', 15, 4, 99)
  score.run('L25', 15, 2, 130)
  score.run('L25', 15, 3, 111)
  score.run('L25', 16, 1, 108)
  score.run('L25', 16, 2, 115)

  addBracket(db, 'L25', 'winners', [
    { matchId: 1, round: 1, t1: 1, t2: 4, w: 1, l: 4 },
    { matchId: 2, round: 1, t1: 2, t2: 3, w: 2, l: 3 },
    {
      matchId: 3,
      round: 2,
      t1: 1,
      t2: 2,
      w: 2,
      l: 1,
      p: 1,
      t1From: '{"w":1}',
      t2From: '{"w":2}',
    },
  ])

  // 2026: matches exist, but nothing is decided yet.
  addBracket(db, 'L26', 'winners', [
    { matchId: 1, round: 1, t1: null, t2: null, w: null, t1From: '{"w":9}' },
  ])
}

describe('getSeasonBracket', () => {
  it('groups matches into rounds and maps each round onto its fantasy week', () => {
    const db = freshDb()
    seed(db)
    const view = getSeasonBracket(db, 'd', 2025)!
    expect(view.winners.rounds.map((r) => ({ round: r.round, week: r.week }))).toEqual([
      { round: 1, week: 15 },
      { round: 2, week: 16 },
    ])
  })

  it('attaches names, seeds and that week’s score to each side', () => {
    const db = freshDb()
    seed(db)
    const [semi] = getSeasonBracket(db, 'd', 2025)!.winners.rounds[0].matches
    expect(semi.t1).toMatchObject({ name: 'Ana', seed: 1, points: 120, won: true })
    expect(semi.t2).toMatchObject({ name: 'Dee', seed: 4, points: 99, won: false })
  })

  it('marks the championship and its winner', () => {
    const db = freshDb()
    seed(db)
    const final = getSeasonBracket(db, 'd', 2025)!.winners.rounds[1].matches[0]
    expect(final.placement).toBe(1)
    // Bo took the final 115-108 despite Ana being the 1 seed.
    expect(final.t2).toMatchObject({ name: 'Bo', points: 115, won: true })
    expect(final.t1).toMatchObject({ name: 'Ana', points: 108, won: false })
  })

  it('resolves rosters against the right season, not whoever holds the id now', () => {
    const db = freshDb()
    seed(db)
    // Roster 1 is Ana in 2025 and Dee in 2026. The 2025 bracket must say Ana.
    const [semi] = getSeasonBracket(db, 'd', 2025)!.winners.rounds[0].matches
    expect(semi.t1?.name).toBe('Ana')
  })

  it('describes an unresolved slot by the match that feeds it', () => {
    const db = freshDb()
    seed(db)
    const [pending] = getSeasonBracket(db, 'd', 2026)!.winners.rounds[0].matches
    expect(pending.t1).toBeNull()
    expect(pending.from.t1).toBe('winner of 9')
  })

  it('returns null for a season with no bracket, and for an unknown league', () => {
    const db = freshDb()
    seed(db)
    expect(getSeasonBracket(db, 'd', 1999)).toBeNull()
    expect(getSeasonBracket(db, 'nope', 2025)).toBeNull()
  })
})

describe('getBracketSeasons', () => {
  it('skips a season whose bracket is an empty skeleton', () => {
    const db = freshDb()
    seed(db)
    // 2026 has bracket rows but no decided match, so it isn't offered.
    expect(getBracketSeasons(db, 'd')).toEqual([2025])
  })
})
