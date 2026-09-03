/**
 * SQLite connection singleton (better-sqlite3).
 *
 * The DB normally lives in the mounted cache dir (CACHE_DIR) so it survives
 * restarts. If that dir can't be written (a misconfigured volume — the #1 NAS
 * problem) the app falls back to an EPHEMERAL location so it still runs; the UI
 * then shows a loud "data will be lost on restart" banner.
 */
import fs from 'fs'
import path from 'path'
import os from 'os'
import Database from 'better-sqlite3'
import { runMigrations } from './migrate.js'
import { trace } from '../fatal.js'

export type DB = Database.Database

const PREFERRED_DIR = process.env.CACHE_DIR ?? path.join(process.cwd(), 'cache')
const FALLBACK_DIR = path.join(os.tmpdir(), 'sdff-data')

let db: DB | null = null
let resolvedDir: string | null = null
let ephemeral = false

/** true when the DB is in a non-persistent location because CACHE_DIR failed. */
export function isEphemeralStorage(): boolean {
  return ephemeral
}

export function cacheDir(): string {
  return resolvedDir ?? PREFERRED_DIR
}

function canWrite(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true })
    const probe = path.join(dir, `.write-test-${process.pid}`)
    fs.writeFileSync(probe, 'ok')
    fs.unlinkSync(probe)
    return true
  } catch {
    return false
  }
}

function resolveDir(): void {
  if (resolvedDir) return
  trace(`checking write access to ${PREFERRED_DIR}`)
  if (canWrite(PREFERRED_DIR)) {
    resolvedDir = PREFERRED_DIR
    trace(`storage OK (persistent): ${resolvedDir}`)
    return
  }
  trace(`${PREFERRED_DIR} is NOT writable — falling back to ${FALLBACK_DIR}`)
  if (canWrite(FALLBACK_DIR)) {
    resolvedDir = FALLBACK_DIR
    ephemeral = true
    const warn =
      `\n**********************************************************************\n` +
      `  WARNING: ${PREFERRED_DIR} is not writable.\n` +
      `  Running with EPHEMERAL storage at ${FALLBACK_DIR} — the database,\n` +
      `  your password and your leagues WILL BE LOST when the container\n` +
      `  restarts. Fix the /app/cache volume (TrueNAS: an ixVolume mounted\n` +
      `  at /app/cache, not read-only) and restart.\n` +
      `**********************************************************************\n`
    fs.writeSync(1, warn)
    fs.writeSync(2, warn)
    return
  }
  // Neither works — genuinely can't run.
  throw new Error(
    `Neither ${PREFERRED_DIR} nor ${FALLBACK_DIR} is writable (uid ${process.getuid?.() ?? '?'}).`,
  )
}

export function getDb(): DB {
  if (db) return db
  resolveDir()

  const dbPathResolved = process.env.DB_PATH ?? path.join(resolvedDir!, 'sdff.db')
  trace(`opening database ${dbPathResolved}`)
  const conn = new Database(dbPathResolved)
  trace('database opened; setting pragmas')
  conn.pragma('journal_mode = WAL')
  conn.pragma('foreign_keys = ON')
  conn.pragma('busy_timeout = 5000')

  trace('running migrations')
  runMigrations(conn)
  trace('migrations done')

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
  return process.env.DB_PATH ?? path.join(cacheDir(), 'sdff.db')
}
