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

/** Fail loudly and clearly if the persistent data dir isn't usable. */
function assertWritable(dir: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true })
    const probe = path.join(dir, `.write-test-${process.pid}`)
    fs.writeFileSync(probe, 'ok')
    fs.unlinkSync(probe)
  } catch (err) {
    console.error(
      `\n[startup] FATAL: cannot write to ${dir} (uid ${process.getuid?.() ?? '?'}).\n` +
        `  The app stores its SQLite database here and can't start without it.\n` +
        `  TrueNAS: use an "ixVolume" for /app/cache (auto-created, writable), or a\n` +
        `  Host Path on a dataset the app owns. Underlying error: ${(err as Error).message}\n`,
    )
    process.exit(1)
  }
}

export function getDb(): DB {
  if (db) return db

  assertWritable(path.dirname(DB_PATH))

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
