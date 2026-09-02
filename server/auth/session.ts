/**
 * Signed-cookie sessions (PLAN.md §6.1).
 *
 * A session records which league slugs the visitor unlocked (by entering an
 * access code) and whether they are an admin. It is an HMAC-signed,
 * base64url-encoded JSON token — no server-side session store, no external dep.
 */
import crypto from 'node:crypto'

export const SESSION_COOKIE = 'sdff_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export interface SessionPayload {
  /** League slugs this session may read. */
  slugs: string[]
  admin: boolean
  /** issued-at, epoch ms */
  iat: number
}

function getSecret(): string {
  const s = process.env.SESSION_SECRET
  if (s && s.length >= 16) return s
  // Fallback keeps single-instance deploys working without a new env var, but
  // rotates the signing key on every SITE_PASSWORD change (acceptable).
  const fallback = process.env.SITE_PASSWORD
  if (fallback) return `sdff-session-${fallback}`
  throw new Error('SESSION_SECRET (or SITE_PASSWORD) must be set to sign sessions')
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

export function sessionCookieOptions(isProd: boolean): {
  httpOnly: true
  sameSite: 'lax'
  secure: boolean
  maxAge: number
  path: string
} {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
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
