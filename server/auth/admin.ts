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
const KEY_RESET_TOKEN = 'reset_admin_token'

function hash(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex')
}

/** Minimum commissioner password length. Also enforced in the setup UI. */
export const MIN_PASSWORD_LENGTH = 12

export function setAdminPassword(db: DB, password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Admin password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  }
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

/**
 * Escape hatch: setting RESET_ADMIN (to any non-empty, non-"0" value) once
 * clears the commissioner password so the setup screen reappears. It's a
 * one-shot — the value is remembered, so leaving the env var set is harmless.
 * To reset again later, change RESET_ADMIN to a different value.
 */
export function maybeResetAdmin(db: DB): void {
  const token = process.env.RESET_ADMIN
  if (!token || token === '0') return
  if (getKv(db, KEY_RESET_TOKEN) === token) return // already consumed this token
  db.prepare(`DELETE FROM kv WHERE key = ?`).run(KEY_PW)
  setKv(db, KEY_RESET_TOKEN, token)
  console.warn(
    `[admin] RESET_ADMIN=${token} — commissioner password cleared; open the app to set a new one`,
  )
}

export function getSleeperUsername(db: DB): string | null {
  return getKv(db, KEY_USERNAME)
}

export function setSleeperUsername(db: DB, username: string): void {
  setKv(db, KEY_USERNAME, username.trim())
}
