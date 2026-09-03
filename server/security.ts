/**
 * Security response headers (PLAN.md §6). Applied to every response — static
 * assets, the SPA document and the API alike.
 *
 * The app is fully self-hosted: the only third-party origins it touches are
 * Google Fonts (stylesheet + font files) and Sleeper's avatar CDN. Everything
 * else is same-origin, so the CSP can be tight.
 */
import type { NextFunction, Request, Response } from 'express'

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // React sets inline style attributes; Vite injects a small inline style block.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' https://sleepercdn.com data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), interest-cohort=()')
  res.setHeader('Content-Security-Policy', CSP)
  // The whole site is behind an access code — keep it out of search indexes.
  res.setHeader('X-Robots-Tag', 'noindex, nofollow')
  if (req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains')
  }
  next()
}
