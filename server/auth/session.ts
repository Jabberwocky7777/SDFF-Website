/**
 * Signed-cookie sessions (PLAN.md §6.1).
 *
 * A session records which league slugs the visitor unlocked (by entering an
 * access code) and whether they are an admin. It is an HMAC-signed,
 * base64url-encoded JSON token — no server-side session store, no external dep.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { cacheDir } from '../db/index.js'

export const SESSION_COOKIE = 'sdff_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export interface SessionPayload {
  /** League slugs this session may read. */
  slugs: string[]
  admin: boolean
  /** issued-at, epoch ms */
  iat: number
}

let cachedSecret: string | null = null

/**
 * Signing key for session cookies. Uses SESSION_SECRET if provided; otherwise
 * generates one and persists it in the cache dataset so it survives restarts
 * (no env var needed for a standard single-instance TrueNAS deploy).
 */
function getSecret(): string {
  if (cachedSecret) return cachedSecret

  const fromEnv = process.env.SESSION_SECRET
  if (fromEnv && fromEnv.length >= 16) {
    cachedSecret = fromEnv
    return cachedSecret
  }

  const secretFile = path.join(cacheDir(), '.session-secret')
  try {
    cachedSecret = fs.readFileSync(secretFile, 'utf8').trim()
    if (cachedSecret.length >= 16) return cachedSecret
  } catch {
    /* generate below */
  }

  cachedSecret = crypto.randomBytes(32).toString('hex')
  try {
    fs.mkdirSync(cacheDir(), { recursive: true })
    fs.writeFileSync(secretFile, cachedSecret, { mode: 0o600 })
    console.log('[auth] generated a new session secret at', secretFile)
  } catch (err) {
    console.warn('[auth] could not persist session secret — sessions reset on restart:', err)
  }
  return cachedSecret
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64url')
}

function hmac(data: string): string {
  return crypto.createHmac('sha256', getSecret()).update(data).digest('base64url')
}

export function signSession(payload: Omit<SessionPayload, 'iat'>): string {
  const full: SessionPayload = { ...payload, iat: Date.now() }
  const body = b64url(JSON.stringify(full))
  return `${body}.${hmac(body)}`
}

export function verifySession(token: string | undefined | null): SessionPayload | null {
  if (!token) return null
  const dot = token.lastIndexOf('.')
  if (dot < 0) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)

  const expected = hmac(body)
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return null
  }

  let payload: SessionPayload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload
  } catch {
    return null
  }

  if (
    !payload ||
    !Array.isArray(payload.slugs) ||
    typeof payload.admin !== 'boolean' ||
    typeof payload.iat !== 'number'
  ) {
    return null
  }
  if (Date.now() - payload.iat > SESSION_TTL_MS) return null

  return payload
}

/**
 * Cookie flags. `secure` MUST follow the actual request protocol, not
 * NODE_ENV — a Secure cookie set over plain HTTP is silently dropped by the
 * browser, which is exactly what happens on a NAS accessed by host:port with
 * no HTTPS. Pass `req.secure` (Express respects X-Forwarded-Proto when
 * `trust proxy` is set).
 */
export function sessionCookieOptions(secure: boolean): {
  httpOnly: true
  sameSite: 'lax'
  secure: boolean
  maxAge: number
  path: string
} {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: SESSION_TTL_MS,
    path: '/',
  }
}

/** Parse the session cookie out of a raw Cookie header. */
export function readSessionCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() === SESSION_COOKIE) {
      return decodeURIComponent(part.slice(eq + 1).trim())
    }
  }
  return null
}
