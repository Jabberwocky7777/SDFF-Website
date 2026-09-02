/**
 * Apply pending SQLite migrations, then print the schema summary.
 *   npm run db:migrate
 */
import { getDb, dbPath, closeDb } from '../db/index.js'

const db = getDb()
const version = db.pragma('user_version', { simple: true })
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all() as Array<{ name: string }>

console.log(`DB: ${dbPath()}`)
console.log(`Schema version: ${version}`)
console.log(`Tables (${tables.length}): ${tables.map((t) => t.name).join(', ')}`)

closeDb()
