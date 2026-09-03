/**
 * Auth middleware (PLAN.md §6).
 *
 * Authentication is a single signed `sdff_session` cookie, set by
 * `POST /api/auth/login` when the visitor enters a league access code (or the
 * admin code). There is no site password and no per-request credentials — the
 * codes live only in `config/leagues.json`.
 *
 * `req.auth` is populated for downstream handlers; route-level guards
 * (`requireLeagueAccess`, `requireAdmin`) enforce scope.
 */
import type { NextFunction, Request, Response } from 'express'
import { getLeagues } from '../config/leagues.js'
import { readSessionCookie, verifySession } from './session.js'

export interface RequestAuth {
  slugs: string[]
  admin: boolean
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: RequestAuth
    }
  }
}

/** Populate req.auth from the session cookie. Never rejects. */
export function attachAuth(req: Request, _res: Response, next: NextFunction): void {
  const session = verifySession(readSessionCookie(req.headers.cookie))
  if (session) {
    req.auth = { slugs: session.slugs, admin: session.admin }
  }
  next()
}

/** 401 unless the request has a valid session. */
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

/** Admin actions require a session created with the admin code. */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.auth?.admin) return next()
  res.status(403).json({ error: 'forbidden' })
}
