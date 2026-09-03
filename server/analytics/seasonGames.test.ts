import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPositionalFinishes, getSeasonGames } from './playerSeason.js'
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
  // player_season_scoring is keyed on a family, so one has to exist.
  db.prepare(
    `INSERT INTO league_family (id, slug, display_name, league_type, current_league_id)
     VALUES (1, 'd', 'D', 'redraft', 'L')`,
  ).run()
  return db
}

/**
 * A realistic shape: a long tail of backups who played a handful of games, a
 * body of starters at a full 17, and one traded player credited with 18.
 */
function seed(db: DB, season = 2025): void {
  const insert = db.prepare(
    `INSERT INTO player_season_scoring (family_id, season, player_id, position, points, pos_rank, games)
     VALUES (1, ?, ?, 'RB', ?, ?, ?)`,
  )
  let rank = 1
  for (let i = 0; i < 80; i++) insert.run(season, `backup${i}`, 10, rank++, (i % 8) + 1)
  for (let i = 0; i < 19; i++) insert.run(season, `starter${i}`, 200, rank++, 17)
  insert.run(season, 'traded', 150, rank++, 18)
}

describe('getSeasonGames', () => {
  it('reports a full season, not the outlier from a mid-season trade', () => {
    const db = freshDb()
    seed(db)
    // MAX() would say 18 and make every healthy starter look like he missed one.
    expect(getSeasonGames(db, 1, 2025)).toBe(17)
  })

  it('follows the era — a 2020 season is 16 games', () => {
    const db = freshDb()
    const insert = db.prepare(
      `INSERT INTO player_season_scoring (family_id, season, player_id, position, points, pos_rank, games)
       VALUES (1, 2020, ?, 'RB', 10, ?, ?)`,
    )
    let rank = 1
    for (let i = 0; i < 80; i++) insert.run(`backup${i}`, rank++, (i % 8) + 1)
    for (let i = 0; i < 20; i++) insert.run(`starter${i}`, rank++, 16)
    expect(getSeasonGames(db, 1, 2020)).toBe(16)
  })

  it('is null when nothing has been scored for that season', () => {
    const db = freshDb()
    expect(getSeasonGames(db, 1, 2019)).toBeNull()
  })

  it('ignores rows with no games recorded rather than counting them as zero', () => {
    const db = freshDb()
    const insert = db.prepare(
      `INSERT INTO player_season_scoring (family_id, season, player_id, position, points, pos_rank, games)
       VALUES (1, 2025, ?, 'RB', 10, ?, ?)`,
    )
    let rank = 1
    for (let i = 0; i < 50; i++) insert.run(`unknown${i}`, rank++, null)
    for (let i = 0; i < 10; i++) insert.run(`starter${i}`, rank++, 17)
    expect(getSeasonGames(db, 1, 2025)).toBe(17)
  })
})

describe('getPositionalFinishes', () => {
  it('carries games through, so a cratered finish can be explained', () => {
    const db = freshDb()
    seed(db)
    db.prepare(
      `INSERT INTO player_season_scoring (family_id, season, player_id, position, points, pos_rank, games)
       VALUES (1, 2025, 'injured', 'WR', 30, 120, 4)`,
    ).run()

    const finishes = getPositionalFinishes(db, 1, 2025)
    expect(finishes.get('injured')).toEqual({
      posRank: 120,
      points: 30,
      position: 'WR',
      games: 4,
    })
    // The healthy comparison case still reports its games rather than null.
    expect(finishes.get('starter0')?.games).toBe(17)
  })
})
