import { describe, expect, it, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MIN_PASSWORD_LENGTH,
  bumpSessionVersion,
  getSessionVersion,
  isSetupComplete,
  maybeResetAdmin,
  setAdminPassword,
  verifyAdminPassword,
} from './admin.js'
import type { DB } from '../db/index.js'

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations')

function freshDb(): DB {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  for (const f of fs.readdirSync(migrationsDir).filter((x) => x.endsWith('.sql')).sort()) {
    db.exec(fs.readFileSync(path.join(migrationsDir, f), 'utf8'))
  }
  return db
}

const GOOD = 'correct-horse-battery'

let db: DB

beforeEach(() => {
  db = freshDb()
  delete process.env.RESET_ADMIN
})

describe('commissioner password', () => {
  it('is not set on a fresh install', async () => {
    expect(isSetupComplete(db)).toBe(false)
    expect(await verifyAdminPassword(db, GOOD)).toBe(false)
  })

  it('round-trips a correct password and rejects a wrong one', async () => {
    await setAdminPassword(db, GOOD)
    expect(isSetupComplete(db)).toBe(true)
    expect(await verifyAdminPassword(db, GOOD)).toBe(true)
    expect(await verifyAdminPassword(db, GOOD + 'x')).toBe(false)
    expect(await verifyAdminPassword(db, '')).toBe(false)
  })

  it('never stores the password itself', async () => {
    await setAdminPassword(db, GOOD)
    const stored = (db.prepare(`SELECT value FROM kv WHERE key = 'admin_pw'`).get() as {
      value: string
    }).value
    expect(stored).not.toContain(GOOD)
    // salt:hash, both hex
    expect(stored).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/)
  })

  it('salts, so the same password hashes differently each time', async () => {
    await setAdminPassword(db, GOOD)
    const first = (db.prepare(`SELECT value FROM kv WHERE key = 'admin_pw'`).get() as {
      value: string
    }).value
    await setAdminPassword(db, GOOD)
    const second = (db.prepare(`SELECT value FROM kv WHERE key = 'admin_pw'`).get() as {
      value: string
    }).value
    expect(second).not.toBe(first)
    expect(await verifyAdminPassword(db, GOOD)).toBe(true)
  })

  it(`rejects anything shorter than ${MIN_PASSWORD_LENGTH} characters`, async () => {
    await expect(setAdminPassword(db, 'a'.repeat(MIN_PASSWORD_LENGTH - 1))).rejects.toThrow(
      /at least/,
    )
    expect(isSetupComplete(db)).toBe(false)
  })
})

describe('session version', () => {
  it('starts at zero and increments on bump', () => {
    expect(getSessionVersion(db)).toBe(0)
    bumpSessionVersion(db)
    expect(getSessionVersion(db)).toBe(1)
    bumpSessionVersion(db)
    expect(getSessionVersion(db)).toBe(2)
  })

  it('is bumped by a password change, so old sessions stop verifying', async () => {
    const before = getSessionVersion(db)
    await setAdminPassword(db, GOOD)
    expect(getSessionVersion(db)).toBeGreaterThan(before)
  })

  it('persists to the kv table rather than living only in memory', () => {
    bumpSessionVersion(db)
    const stored = db.prepare(`SELECT value FROM kv WHERE key = 'session_version'`).get() as
      | { value: string }
      | undefined
    expect(stored?.value).toBe(String(getSessionVersion(db)))
  })
})

describe('RESET_ADMIN', () => {
  it('does nothing when unset', async () => {
    await setAdminPassword(db, GOOD)
    maybeResetAdmin(db)
    expect(isSetupComplete(db)).toBe(true)
  })

  it('clears the password once per distinct token', async () => {
    await setAdminPassword(db, GOOD)

    process.env.RESET_ADMIN = 'token-one'
    maybeResetAdmin(db)
    expect(isSetupComplete(db)).toBe(false)

    // Re-setting with the same token still present must not clear it again,
    // or the app would be stuck at the setup screen every restart.
    await setAdminPassword(db, GOOD)
    maybeResetAdmin(db)
    expect(isSetupComplete(db)).toBe(true)

    // A different value arms it again.
    process.env.RESET_ADMIN = 'token-two'
    maybeResetAdmin(db)
    expect(isSetupComplete(db)).toBe(false)
  })

  it('treats "0" as off', async () => {
    await setAdminPassword(db, GOOD)
    process.env.RESET_ADMIN = '0'
    maybeResetAdmin(db)
    expect(isSetupComplete(db)).toBe(true)
  })
})
