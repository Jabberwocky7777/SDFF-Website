/**
 * SQLite connection singleton (better-sqlite3).
 *
 * The DB file lives in the mounted cache dataset (CACHE_DIR) so it survives
 * container restarts and is picked up by TrueNAS snapshots (PLAN.md §2).
 */
import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import { runMigrations } from './migrate.js'

export type DB = Database.Database

const CACHE_DIR = process.env.CACHE_DIR ?? path.join(process.cwd(), 'cache')
const DB_PATH = process.env.DB_PATH ?? path.join(CACHE_DIR, 'sdff.db')

let db: DB | null = null

export function getDb(): DB {
  if (db) return db

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

  const conn = new Database(DB_PATH)
  conn.pragma('journal_mode = WAL')
  conn.pragma('foreign_keys = ON')
  conn.pragma('busy_timeout = 5000')

  runMigrations(conn)

  db = conn
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}

export function dbPath(): string {
  return DB_PATH
}
