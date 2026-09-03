import { describe, expect, it, beforeAll, beforeEach, afterAll } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Session tokens are the whole authentication story — stateless, self-
 * describing, and trusted on every request. These cover the three ways one
 * could be wrong: forged, expired, or revoked.
 *
 * CACHE_DIR and SESSION_SECRET are set before importing the module under test,
 * because it resolves both at first use.
 */
let dir: string

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdff-session-test-'))
  process.env.CACHE_DIR = dir
  process.env.DB_PATH = path.join(dir, 'test.db')
  process.env.SESSION_SECRET = 'a'.repeat(48)
})

afterAll(async () => {
  // Windows won't unlink a directory while the SQLite file handle is open.
  const { getDb } = await import('../db/index.js')
  try {
    getDb().close()
  } catch {
    /* already closed */
  }
  fs.rmSync(dir, { recursive: true, force: true })
  delete process.env.SESSION_SECRET
  delete process.env.DB_PATH
})

const load = async () => {
  const session = await import('./session.js')
  const admin = await import('./admin.js')
  const { getDb } = await import('../db/index.js')
  return { ...session, ...admin, getDb }
}

beforeEach(async () => {
  // Reset the revocation counter between tests without rebuilding the DB.
  const { getDb } = await load()
  getDb().prepare(`DELETE FROM kv WHERE key = 'session_version'`).run()
})

describe('signSession / verifySession', () => {
  it('round-trips slugs and the admin flag', async () => {
    const { signSession, verifySession } = await load()
    const payload = verifySession(signSession({ slugs: ['sdff', 'athens'], admin: true }))
    expect(payload).not.toBeNull()
    expect(payload!.slugs).toEqual(['sdff', 'athens'])
    expect(payload!.admin).toBe(true)
  })

  it('rejects junk, empty and missing tokens', async () => {
    const { verifySession } = await load()
    for (const t of [undefined, null, '', 'nonsense', 'no-dot-here']) {
      expect(verifySession(t)).toBeNull()
    }
  })

  it('rejects a token whose signature does not match the body', async () => {
    const { signSession, verifySession } = await load()
    const token = signSession({ slugs: ['sdff'], admin: false })
    const [body, sig] = [token.slice(0, token.lastIndexOf('.')), token.slice(token.lastIndexOf('.') + 1)]
    // Same length, different content — the compare must not be a prefix match.
    const flipped = sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A')
    expect(verifySession(`${body}.${flipped}`)).toBeNull()
  })

  it('rejects a privilege escalation attempt on the payload', async () => {
    const { signSession, verifySession } = await load()
    const token = signSession({ slugs: ['sdff'], admin: false })
    const [body, sig] = [token.slice(0, token.lastIndexOf('.')), token.slice(token.lastIndexOf('.') + 1)]

    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    expect(decoded.admin).toBe(false)
    decoded.admin = true
    decoded.slugs = ['sdff', 'athens', 'shrums']
    const forged = Buffer.from(JSON.stringify(decoded)).toString('base64url')

    // Re-encoded body, original signature -> must fail.
    expect(verifySession(`${forged}.${sig}`)).toBeNull()
  })

  it('rejects a token signed with a different key', async () => {
    const { signSession, verifySession } = await load()
    const token = signSession({ slugs: ['sdff'], admin: true })
    const body = token.slice(0, token.lastIndexOf('.'))
    const wrong = crypto.createHmac('sha256', 'not-the-real-secret').update(body).digest('base64url')
    expect(verifySession(`${body}.${wrong}`)).toBeNull()
  })

  it('rejects a token past its 30-day TTL', async () => {
    const { verifySession } = await load()
    const stale = {
      slugs: ['sdff'],
      admin: false,
      iat: Date.now() - 31 * 24 * 60 * 60 * 1000,
      v: 0,
    }
    const body = Buffer.from(JSON.stringify(stale)).toString('base64url')
    const sig = crypto
      .createHmac('sha256', process.env.SESSION_SECRET!)
      .update(body)
      .digest('base64url')
    // Correctly signed, but expired.
    expect(verifySession(`${body}.${sig}`)).toBeNull()
  })

  it('rejects a payload of the wrong shape even when correctly signed', async () => {
    const { verifySession } = await load()
    for (const bad of [{ slugs: 'sdff', admin: false, iat: Date.now() }, { admin: true, iat: Date.now() }, {}]) {
      const body = Buffer.from(JSON.stringify(bad)).toString('base64url')
      const sig = crypto
        .createHmac('sha256', process.env.SESSION_SECRET!)
        .update(body)
        .digest('base64url')
      expect(verifySession(`${body}.${sig}`)).toBeNull()
    }
  })
})

describe('revocation via session version', () => {
  it('invalidates outstanding tokens when the version is bumped', async () => {
    const { signSession, verifySession, bumpSessionVersion, getDb } = await load()
    const token = signSession({ slugs: ['sdff'], admin: true })
    expect(verifySession(token)).not.toBeNull()

    bumpSessionVersion(getDb())
    expect(verifySession(token)).toBeNull()
  })

  it('issues tokens that survive under the new version', async () => {
    const { signSession, verifySession, bumpSessionVersion, getDb } = await load()
    bumpSessionVersion(getDb())
    expect(verifySession(signSession({ slugs: ['sdff'], admin: false }))).not.toBeNull()
  })

  it('signs out every session when the commissioner password changes', async () => {
    const { signSession, verifySession, setAdminPassword, getDb } = await load()
    const memberToken = signSession({ slugs: ['sdff'], admin: false })
    const adminToken = signSession({ slugs: ['sdff'], admin: true })

    await setAdminPassword(getDb(), 'a-brand-new-passphrase')

    expect(verifySession(memberToken)).toBeNull()
    expect(verifySession(adminToken)).toBeNull()
  })
})

describe('cookie flags', () => {
  it('is httpOnly and lax, and follows the request protocol for secure', async () => {
    const { sessionCookieOptions } = await load()
    expect(sessionCookieOptions(false)).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
    })
    expect(sessionCookieOptions(true).secure).toBe(true)
  })
})

describe('readSessionCookie', () => {
  it('picks the session cookie out of a crowded header', async () => {
    const { readSessionCookie, SESSION_COOKIE } = await load()
    expect(readSessionCookie(`other=1; ${SESSION_COOKIE}=abc.def; theme=dark`)).toBe('abc.def')
    expect(readSessionCookie(`${SESSION_COOKIE}=only`)).toBe('only')
  })

  it('returns null when absent or malformed', async () => {
    const { readSessionCookie } = await load()
    expect(readSessionCookie(undefined)).toBeNull()
    expect(readSessionCookie('other=1; theme=dark')).toBeNull()
    expect(readSessionCookie('novalue')).toBeNull()
  })
})
