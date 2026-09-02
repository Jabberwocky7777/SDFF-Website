/**
 * Auth endpoints (PLAN.md §6.1, §6.3).
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
import { getDb } from '../db/index.js'
import { isSetupComplete } from '../auth/admin.js'
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
} from '../auth/session.js'

const router = Router()
const IS_PROD = process.env.NODE_ENV === 'production'

// ── naive per-IP rate limit: 8 attempts / 15 min ────────────────────────────
const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 8
const attempts = new Map<string, number[]>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const hits = (attempts.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  hits.push(now)
  attempts.set(ip, hits)
  return hits.length > MAX_ATTEMPTS
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

router.post('/auth/login', (req, res) => {
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown'
  if (rateLimited(ip)) {
    res.status(429).json({ error: 'too many attempts, try again later' })
    return
  }

  const code = typeof req.body?.code === 'string' ? req.body.code : ''
  const { admin, slugs } = resolveAccessCode(code)
  if (!admin && slugs.length === 0) {
    res.status(401).json({ error: 'invalid code' })
    return
  }

  const token = signSession({ slugs, admin })
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions(IS_PROD))
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
  }
  if (!req.auth) {
    res.json({ authed: false, slugs: [], admin: false, ...base })
    return
  }
  res.json({ authed: true, slugs: req.auth.slugs, admin: req.auth.admin, ...base })
})

export default router
