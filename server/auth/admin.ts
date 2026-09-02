/**
 * Commissioner (admin) credential + app settings, stored in the DB `kv` table.
 *
 * The admin password is set during first-run setup and changed from the admin
 * settings screen. It is hashed with scrypt (Node built-in). A valid admin
 * login yields a session that unlocks every league plus the settings UI.
 */
import crypto from 'node:crypto'
import type { DB } from '../db/index.js'
import { getKv, setKv } from '../sync/upsert.js'

const KEY_PW = 'admin_pw'
const KEY_USERNAME = 'sleeper_username'
const KEY_SETUP_AT = 'setup_at'

function hash(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex')
}

export function setAdminPassword(db: DB, password: string): void {
  if (password.length < 6) throw new Error('Admin password must be at least 6 characters.')
  const salt = crypto.randomBytes(16).toString('hex')
  setKv(db, KEY_PW, `${salt}:${hash(password, salt)}`)
  if (!getKv(db, KEY_SETUP_AT)) setKv(db, KEY_SETUP_AT, String(Date.now()))
}

export function verifyAdminPassword(db: DB, password: string): boolean {
  const stored = getKv(db, KEY_PW)
  if (!stored) return false
  const [salt, expected] = stored.split(':')
  if (!salt || !expected) return false
  const actual = hash(password, salt)
  return (
    actual.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'))
  )
}

export function isSetupComplete(db: DB): boolean {
  return !!getKv(db, KEY_PW)
}

/** Escape hatch: RESET_ADMIN=1 clears the password so the setup screen reappears. */
export function maybeResetAdmin(db: DB): void {
  if (process.env.RESET_ADMIN === '1') {
    db.prepare(`DELETE FROM kv WHERE key = ?`).run(KEY_PW)
    console.warn('[admin] RESET_ADMIN=1 — admin password cleared; visit the app to set a new one')
  }
}

export function getSleeperUsername(db: DB): string | null {
  return getKv(db, KEY_USERNAME)
}

export function setSleeperUsername(db: DB, username: string): void {
  setKv(db, KEY_USERNAME, username.trim())
}
