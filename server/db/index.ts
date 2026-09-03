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
import { die } from '../fatal.js'

export type DB = Database.Database

const CACHE_DIR = process.env.CACHE_DIR ?? path.join(process.cwd(), 'cache')
const DB_PATH = process.env.DB_PATH ?? path.join(CACHE_DIR, 'sdff.db')

let db: DB | null = null

/** Fail loudly and clearly if the persistent data dir isn't usable. */
function assertWritable(dir: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true })
    const probe = path.join(dir, `.write-test-${process.pid}`)
    fs.writeFileSync(probe, 'ok')
    fs.unlinkSync(probe)
  } catch (err) {
    die(
      `cannot write to ${dir} (uid ${process.getuid?.() ?? '?'}).\n` +
        `The app stores its SQLite database here. On TrueNAS: the /app/cache volume\n` +
        `must be an ixVolume (or a writable Host Path) and NOT read-only.`,
      err,
    )
  }
}

export function getDb(): DB {
  if (db) return db

  assertWritable(path.dirname(DB_PATH))

  let conn: DB
  try {
    conn = new Database(DB_PATH)
    conn.pragma('journal_mode = WAL')
    conn.pragma('foreign_keys = ON')
    conn.pragma('busy_timeout = 5000')
  } catch (err) {
    die(`could not open the SQLite database at ${DB_PATH}`, err)
  }

  try {
    runMigrations(conn)
  } catch (err) {
    die('database migration failed', err)
  }

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
