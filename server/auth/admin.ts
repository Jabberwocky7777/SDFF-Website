/**
 * Commissioner (admin) credential + app settings, stored in the DB `kv` table.
 *
 * The admin password is set during first-run setup and changed from the admin
 * settings screen. It is hashed with scrypt (Node built-in). A valid admin
 * login yields a session that unlocks every league plus the settings UI.
 */
import crypto from 'node:crypto'
import { promisify } from 'node:util'
import type { DB } from '../db/index.js'
import { getKv, setKv } from '../sync/upsert.js'

const KEY_PW = 'admin_pw'
const KEY_USERNAME = 'sleeper_username'
const KEY_SETUP_AT = 'setup_at'
const KEY_RESET_TOKEN = 'reset_admin_token'
const KEY_SESSION_VERSION = 'session_version'

// Async so a login attempt doesn't block the event loop for the ~100ms scrypt
// takes. Logins are unauthenticated, so the synchronous version handed anyone
// a cheap way to stall every other request on this single-threaded process.
const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>

async function hash(password: string, salt: string): Promise<string> {
  return (await scrypt(password, salt, 64)).toString('hex')
}

/** Minimum commissioner password length. Also enforced in the setup UI. */
export const MIN_PASSWORD_LENGTH = 12

export async function setAdminPassword(db: DB, password: string): Promise<void> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Admin password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  }
  const salt = crypto.randomBytes(16).toString('hex')
  setKv(db, KEY_PW, `${salt}:${await hash(password, salt)}`)
  if (!getKv(db, KEY_SETUP_AT)) setKv(db, KEY_SETUP_AT, String(Date.now()))
  // Sessions outlive a password change otherwise — they carry no reference to
  // the credential that created them.
  bumpSessionVersion(db)
}

export async function verifyAdminPassword(db: DB, password: string): Promise<boolean> {
  const stored = getKv(db, KEY_PW)
  if (!stored) return false
  const [salt, expected] = stored.split(':')
  if (!salt || !expected) return false
  const actual = await hash(password, salt)
  return (
    actual.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'))
  )
}

// ── Session invalidation ────────────────────────────────────────────────────

/**
 * Monotonic counter stamped into every session token. Bumping it invalidates
 * every outstanding cookie, which is the only revocation available to a
 * stateless session scheme short of rotating the signing key.
 *
 * Read on every authenticated request and deliberately not cached: it is a
 * primary-key lookup on a prepared statement, which costs microseconds against
 * the rest of a request, and an in-process cache would go stale whenever the
 * connection is swapped — as it is under the ephemeral-storage fallback.
 */
export function getSessionVersion(db: DB): number {
  return Number(getKv(db, KEY_SESSION_VERSION) ?? 0) || 0
}

export function bumpSessionVersion(db: DB): void {
  setKv(db, KEY_SESSION_VERSION, String(getSessionVersion(db) + 1))
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
