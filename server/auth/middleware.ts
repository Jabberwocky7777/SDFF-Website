/**
 * Auth middleware (PLAN.md §6).
 *
 * Two ways to authenticate, checked in order:
 *   1. The signed `sdff_session` cookie (new per-league access-code flow).
 *   2. HTTP Basic Auth with SITE_PASSWORD (legacy — keeps the current frontend
 *      and the Vite dev proxy working through the migration). A valid legacy
 *      login is treated as full access.
 *
 * `req.auth` is populated for downstream handlers. Route-level guards
 * (`requireLeagueAccess`, `requireAdmin`) enforce scope.
 */
import type { NextFunction, Request, Response } from 'express'
import { getLeagues } from '../config/leagues.js'
import { readSessionCookie, verifySession } from './session.js'

export interface RequestAuth {
  slugs: string[]
  admin: boolean
  legacy: boolean
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: RequestAuth
    }
  }
}

const SITE_PASSWORD = process.env.SITE_PASSWORD ?? ''

function legacyBasicValid(req: Request): boolean {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Basic ') || !SITE_PASSWORD) return false
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8')
  const colon = decoded.indexOf(':')
  const password = colon >= 0 ? decoded.slice(colon + 1) : decoded
  return password === SITE_PASSWORD
}

/** Populate req.auth from a cookie or legacy Basic Auth. Never rejects. */
export function attachAuth(req: Request, _res: Response, next: NextFunction): void {
  const session = verifySession(readSessionCookie(req.headers.cookie))
  if (session) {
    req.auth = { slugs: session.slugs, admin: session.admin, legacy: false }
    return next()
  }
  if (legacyBasicValid(req)) {
    req.auth = { slugs: getLeagues().map((l) => l.slug), admin: true, legacy: true }
    return next()
  }
  next()
}

/** 401 unless the request has any valid auth. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }
  next()
}

/**
 * For `/api/leagues/:slug/...` — 404 for an unknown slug (never a Sleeper call
 * for an arbitrary id, PLAN.md §6.7), 403 if the session can't read it.
 */
export function requireLeagueAccess(req: Request, res: Response, next: NextFunction): void {
  const slug = String((req.params as Record<string, string>).slug)
  const known = getLeagues().some((l) => l.slug === slug)
  if (!known) {
    res.status(404).json({ error: 'unknown league' })
    return
  }
  if (!req.auth) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }
  if (!req.auth.admin && !req.auth.slugs.includes(slug)) {
    res.status(403).json({ error: 'no access to this league' })
    return
  }
  next()
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD

/** Admin via session flag OR the legacy X-Admin-Key header. */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.auth?.admin) return next()
  const key = req.headers['x-admin-key']
  if (ADMIN_PASSWORD && typeof key === 'string' && key === ADMIN_PASSWORD) return next()
  res.status(403).json({ error: 'forbidden' })
}
