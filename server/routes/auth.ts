/**
 * Auth endpoints.
 *
 *   POST /api/auth/login   { code }  -> sets sdff_session cookie
 *   POST /api/auth/logout            -> clears it
 *   GET  /api/auth/session           -> { authed, slugs, admin }
 *
 * Login is rate-limited per IP (naive in-memory sliding window) so a public
 * password gate isn't brute-forceable.
 */
import { Router } from 'express'
import { getLeagues, resolveAccessCode } from '../config/leagues.js'
import { getDb, isEphemeralStorage } from '../db/index.js'
import { isSetupComplete } from '../auth/admin.js'
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
} from '../auth/session.js'

const router = Router()

// ── per-IP rate limit: 10 attempts / 15 min ────────────────────────────────
// Access codes and the commissioner password are both short enough to brute
// force at speed, so this is the only thing standing between the login form
// and an offline-scale guessing run.
const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 10
const attempts = new Map<string, number[]>()

/** Records the attempt and returns true once the window is exceeded. */
function rateLimited(ip: string): boolean {
  const now = Date.now()
  const hits = (attempts.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  hits.push(now)
  attempts.set(ip, hits)
  if (hits.length > MAX_ATTEMPTS) {
    console.warn(`[auth] rate-limiting ${ip} (${hits.length} attempts in ${WINDOW_MS / 60000} min)`)
    return true
  }
  return false
}

/** Clear an IP's attempt count on a successful login. */
function clearAttempts(ip: string): void {
  attempts.delete(ip)
}

// Periodic cleanup so the map doesn't grow unbounded.
setInterval(() => {
  const now = Date.now()
  for (const [ip, hits] of attempts) {
    const live = hits.filter((t) => now - t < WINDOW_MS)
    if (live.length === 0) attempts.delete(ip)
    else attempts.set(ip, live)
  }
}, WINDOW_MS).unref()

router.post('/auth/login', async (req, res) => {
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown'
  if (rateLimited(ip)) {
    res
      .status(429)
      .json({ error: 'Too many attempts. Wait a few minutes (or restart the app) and try again.' })
    return
  }

  const code = typeof req.body?.code === 'string' ? req.body.code : ''
  const { admin, slugs } = await resolveAccessCode(code)
  if (!admin && slugs.length === 0) {
    res.status(401).json({ error: "That code didn't match a league or the commissioner password." })
    return
  }

  clearAttempts(ip)
  const token = signSession({ slugs, admin })
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions(req.secure))
  res.json({ authed: true, slugs, admin })
})

router.post('/auth/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/' })
  res.json({ authed: false })
})

router.get('/auth/session', (req, res) => {
  const db = getDb()
  const leagues = getLeagues(db)
  const base = {
    needsSetup: !isSetupComplete(db),
    hasLeagues: leagues.length > 0,
    /** The lowest-sort-order league — its full dynasty pages are the "home" site. */
    flagshipSlug: leagues[0]?.slug ?? null,
    /** true = the persistent volume failed, data will be lost on restart. */
    ephemeralStorage: isEphemeralStorage(),
  }
  if (!req.auth) {
    res.json({ authed: false, slugs: [], admin: false, ...base })
    return
  }
  res.json({ authed: true, slugs: req.auth.slugs, admin: req.auth.admin, ...base })
})

export default router
