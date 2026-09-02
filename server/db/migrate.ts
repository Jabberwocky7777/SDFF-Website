/**
 * Minimal forward-only migration runner.
 *
 * Migrations are `.sql` files in `server/db/migrations/`, named `NNN_name.sql`
 * (zero-padded integer prefix). The DB's `PRAGMA user_version` tracks the
 * highest applied migration number. On startup every migration with a number
 * greater than `user_version` is applied in order, each in its own transaction.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import type Database from 'better-sqlite3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = path.join(__dirname, 'migrations')

interface Migration {
  version: number
  name: string
  sql: string
}

function loadMigrations(): Migration[] {
  let files: string[]
  try {
    files = fs.readdirSync(MIGRATIONS_DIR)
  } catch {
    throw new Error(`Migrations directory not found: ${MIGRATIONS_DIR}`)
  }

  const migrations = files
    .filter((f) => f.endsWith('.sql'))
    .map((f) => {
      const match = /^(\d+)_/.exec(f)
      if (!match) throw new Error(`Migration file missing numeric prefix: ${f}`)
      return {
        version: Number(match[1]),
        name: f,
        sql: fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'),
      }
    })
    .sort((a, b) => a.version - b.version)

  migrations.forEach((m, i) => {
    if (m.version !== i + 1) {
      throw new Error(
        `Migration numbering gap or duplicate near ${m.name} (expected version ${i + 1}, got ${m.version})`,
      )
    }
  })

  return migrations
}

export function runMigrations(db: Database.Database): void {
  const current = db.pragma('user_version', { simple: true }) as number
  const migrations = loadMigrations()
  const pending = migrations.filter((m) => m.version > current)

  if (pending.length === 0) return

  for (const migration of pending) {
    const tx = db.transaction(() => {
      db.exec(migration.sql)
      // user_version does not accept a bound parameter.
      db.pragma(`user_version = ${migration.version}`)
    })
    tx()
    console.log(`[db] applied migration ${migration.name}`)
  }
}
