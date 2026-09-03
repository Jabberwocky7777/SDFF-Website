import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getMatchupWeeks, getWeekMatchups } from './matchups.js'
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

interface Side {
  roster: number
  user: string
  points: number
  result: 'W' | 'L' | 'T' | null
}

function addGame(
  db: DB,
  leagueId: string,
  week: number,
  matchupId: number | null,
  sides: Side[],
  opts: { playoff?: boolean; consolation?: boolean } = {},
): void {
  for (const [i, s] of sides.entries()) {
    const opp = sides[1 - i]
    db.prepare(
      // `matchup` has no season column — season comes from the league_season join.
      `INSERT INTO matchup (league_id, week, roster_id, matchup_id, user_id, points,
                            opponent_roster_id, opponent_user_id, opponent_points, result,
                            is_playoff, is_consolation)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      leagueId,
      week,
      s.roster,
      matchupId,
      s.user,
      s.points,
      opp?.roster ?? null,
      opp?.user ?? null,
      opp?.points ?? null,
      s.result,
      opts.playoff ? 1 : 0,
      opts.consolation ? 1 : 0,
    )
  }
}

/**
 * Two seasons. `a` and `b` meet three times across them, so the all-time
 * series attached to a single game has history behind it.
 */
function seed(db: DB): void {
  db.prepare(
    `INSERT INTO league_family (id, slug, display_name, league_type, current_league_id)
     VALUES (1,'d','D','redraft','L25')`,
  ).run()
  for (const [leagueId, season, poStart] of [
    ['L24', 2024, 15],
    ['L25', 2025, 14],
  ] as const) {
    db.prepare(
      `INSERT INTO league_season (league_id, family_id, season, status, playoff_week_start)
       VALUES (?,1,?,'complete',?)`,
    ).run(leagueId, season, poStart)
  }
  for (const [u, name] of [
    ['a', 'Ana'],
    ['b', 'Bo'],
    ['c', 'Cy'],
    ['d', 'Dee'],
  ] as const) {
    db.prepare(`INSERT INTO manager (user_id, display_name) VALUES (?,?)`).run(u, name)
  }
  for (const leagueId of ['L24', 'L25']) {
    for (const [rid, u] of [
      [1, 'a'],
      [2, 'b'],
      [3, 'c'],
      [4, 'd'],
    ] as const) {
      db.prepare(
        `INSERT INTO team_season (league_id, roster_id, user_id, team_name) VALUES (?,?,?,?)`,
      ).run(leagueId, rid, u, `Team ${u.toUpperCase()}`)
    }
  }

  // 2024: a beats b twice.
  addGame(db, 'L24', 1, 1, [
    { roster: 1, user: 'a', points: 110, result: 'W' },
    { roster: 2, user: 'b', points: 100, result: 'L' },
  ])
  addGame(db, 'L24', 2, 1, [
    { roster: 1, user: 'a', points: 120, result: 'W' },
    { roster: 2, user: 'b', points: 90, result: 'L' },
  ])

  // 2025 week 1: a loses to b; c and d also play.
  addGame(db, 'L25', 1, 1, [
    { roster: 1, user: 'a', points: 95, result: 'L' },
    { roster: 2, user: 'b', points: 130, result: 'W' },
  ])
  addGame(db, 'L25', 1, 2, [
    { roster: 3, user: 'c', points: 101, result: 'W' },
    { roster: 4, user: 'd', points: 88, result: 'L' },
  ])
}

describe('getWeekMatchups', () => {
  it('collapses the two stored rows per game into one game', () => {
    const db = freshDb()
    seed(db)
    const view = getWeekMatchups(db, 'd', 2025, 1)
    expect(view.games).toHaveLength(2)
    const [first] = view.games
    expect(first.home.name).toBe('Ana')
    expect(first.away?.name).toBe('Bo')
    expect(first.home.points).toBe(95)
    expect(first.away?.points).toBe(130)
    expect(first.final).toBe(true)
    expect(first.bye).toBe(false)
  })

  it('attaches the pair’s all-time series, oriented from the home side', () => {
    const db = freshDb()
    seed(db)
    const [game] = getWeekMatchups(db, 'd', 2025, 1).games
    // Ana leads Bo 2-1 across both seasons, this game included.
    expect(game.h2h).toEqual({ wins: 2, losses: 1, ties: 0, meetings: 3 })
  })

  it('reports a first meeting as zero meetings rather than omitting it', () => {
    const db = freshDb()
    seed(db)
    const game = getWeekMatchups(db, 'd', 2025, 1).games.find((g) => g.home.name === 'Cy')
    expect(game?.h2h).toEqual({ wins: 1, losses: 0, ties: 0, meetings: 1 })
  })

  it('treats a team with no opponent as a decided bye, not an unfinished game', () => {
    const db = freshDb()
    seed(db)
    addGame(db, 'L25', 14, null, [{ roster: 1, user: 'a', points: 118, result: null }], {
      playoff: true,
    })

    const [bye] = getWeekMatchups(db, 'd', 2025, 14).games
    expect(bye.bye).toBe(true)
    expect(bye.away).toBeNull()
    expect(bye.h2h).toBeNull()
    // Points are in, so there is nothing left to decide.
    expect(bye.final).toBe(true)
    expect(bye.isPlayoff).toBe(true)
  })

  it('does not pair two separate byes into one game', () => {
    const db = freshDb()
    seed(db)
    addGame(db, 'L25', 14, null, [{ roster: 1, user: 'a', points: 118, result: null }])
    addGame(db, 'L25', 14, null, [{ roster: 2, user: 'b', points: 104, result: null }])

    const games = getWeekMatchups(db, 'd', 2025, 14).games
    expect(games).toHaveLength(2)
    expect(games.every((g) => g.bye && g.away === null)).toBe(true)
  })

  it('excludes consolation games from the all-time series', () => {
    const db = freshDb()
    seed(db)
    addGame(
      db,
      'L25',
      15,
      9,
      [
        { roster: 1, user: 'a', points: 80, result: 'L' },
        { roster: 2, user: 'b', points: 90, result: 'W' },
      ],
      { consolation: true },
    )

    const [game] = getWeekMatchups(db, 'd', 2025, 15).games
    expect(game.isConsolation).toBe(true)
    // Still 2-1: the consolation meeting itself doesn't count toward the series.
    expect(game.h2h).toEqual({ wins: 2, losses: 1, ties: 0, meetings: 3 })
  })

  it('orders playoff games ahead of consolation ones', () => {
    const db = freshDb()
    seed(db)
    addGame(
      db,
      'L25',
      14,
      5,
      [
        { roster: 1, user: 'a', points: 80, result: 'L' },
        { roster: 2, user: 'b', points: 90, result: 'W' },
      ],
      { consolation: true },
    )
    addGame(
      db,
      'L25',
      14,
      6,
      [
        { roster: 3, user: 'c', points: 120, result: 'W' },
        { roster: 4, user: 'd', points: 99, result: 'L' },
      ],
      { playoff: true },
    )

    const games = getWeekMatchups(db, 'd', 2025, 14).games
    expect(games[0].isPlayoff).toBe(true)
    expect(games[1].isConsolation).toBe(true)
  })

  it('is empty for a week with nothing recorded, and for an unknown league', () => {
    const db = freshDb()
    seed(db)
    expect(getWeekMatchups(db, 'd', 2025, 99).games).toEqual([])
    expect(getWeekMatchups(db, 'nope', 2025, 1).games).toEqual([])
  })
})

describe('getMatchupWeeks', () => {
  it('lists the weeks that exist, newest season first, with the playoff cutoff', () => {
    const db = freshDb()
    seed(db)
    expect(getMatchupWeeks(db, 'd')).toEqual([
      { season: 2025, weeks: [1], playoffWeekStart: 14 },
      { season: 2024, weeks: [1, 2], playoffWeekStart: 15 },
    ])
  })
})
