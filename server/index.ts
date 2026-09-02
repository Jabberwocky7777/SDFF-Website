import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import sleeperRouter from './routes/sleeper.js'
import announcementsRouter from './routes/announcements.js'
import draftRouter from './routes/draft.js'
import adminRouter from './routes/admin.js'
import adminLeaguesRouter from './routes/admin-leagues.js'
import authRouter from './routes/auth.js'
import setupRouter from './routes/setup.js'
import leaguesRouter from './routes/leagues.js'
import { getLeagues, toPublicLeague } from './config/leagues.js'
import { bootstrapLeaguesIfEmpty } from './config/bootstrap.js'
import { maybeResetAdmin } from './auth/admin.js'
import { getDb } from './db/index.js'
import { startScheduler } from './sync/scheduler.js'
import { autoBackfillIfNeeded } from './sync/autobackfill.js'
import {
  attachAuth,
  requireAdmin,
  requireAuth,
  requireDefaultLeagueAccess,
  requireLeagueAccess,
} from './auth/middleware.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Open the SQLite DB (runs migrations), migrate any legacy file/env config into
// it, then start the sync scheduler. A DB failure must not take down the proxy.
try {
  const db = getDb()
  maybeResetAdmin(db)
  bootstrapLeaguesIfEmpty(db)
  const slugs = getLeagues(db).map((l) => l.slug)
  console.log(`[startup] SQLite ready — leagues: ${slugs.join(', ') || '(none — set up in the app)'}`)
  startScheduler()
} catch (err) {
  console.error('[startup] SQLite init failed:', err)
  process.exit(1)
}

const app = express()
const PORT = Number(process.env.SERVER_PORT ?? 3001)
const IS_DEV = process.env.NODE_ENV !== 'production'
app.set('trust proxy', true) // behind a reverse proxy — needed for req.ip rate limiting

// Health check — no auth required
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// Static files and SPA fallback — served without auth so React can load
const distPath = path.join(__dirname, '..', 'dist')
app.use(express.static(distPath))
app.get('/{*splat}', (_req, res, next) => {
  // Only serve index.html for non-API routes
  if (_req.path.startsWith('/api/')) return next()
  res.sendFile(path.join(distPath, 'index.html'))
})

// JSON body parsing for API routes
app.use(express.json())

// Security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  next()
})

// CORS — only allow in dev
if (IS_DEV) {
  app.use(cors({ origin: 'http://localhost:5173', credentials: true }))
}

// Populate req.auth from the session cookie (never rejects).
app.use(attachAuth)

// First-run setup + auth endpoints — reachable without a session.
app.use('/api', setupRouter)
app.use('/api', authRouter)

// Lightweight credential check used by older frontend code.
app.get('/api/me', requireAuth, (_req, res) => {
  res.json({ ok: true })
})

// Everything under /api/admin/* requires an admin session.
app.use('/api/admin', requireAuth, requireAdmin)

// Admin settings API (manage leagues, codes, password).
app.use('/api', adminLeaguesRouter)

// Configured leagues the caller can see (safe fields only — never access codes).
app.get('/api/leagues', requireAuth, (req, res) => {
  const all = getLeagues()
  const visible = req.auth?.admin ? all : all.filter((l) => req.auth?.slugs.includes(l.slug))
  res.json(visible.map(toPublicLeague))
})

// Namespaced per-league API. requireLeagueAccess validates :slug against config
// (404 for unknown) and the session's allowed slugs (403).
app.use('/api/leagues/:slug', requireLeagueAccess, leaguesRouter)

// Everything below requires a valid session (or legacy Basic Auth).
app.use('/api', requireAuth)

// Announcements — visible to any authenticated visitor.
app.use('/api', announcementsRouter)

// Legacy single-league routes serve the DEFAULT league — gate them so a
// session that only unlocked a different league can't read it here.
app.use('/api', requireDefaultLeagueAccess, sleeperRouter)
app.use('/api', requireDefaultLeagueAccess, draftRouter)

// Editable admin data (dues, championship history, squad pot)
app.use('/api', adminRouter)

app.listen(PORT, () => {
  console.log(`SDFF server running on http://localhost:${PORT}`)
  if (IS_DEV) console.log('[dev] open the app to set up the admin password / add leagues')

  // First-run: self-populate history for any league not yet ingested. Deferred
  // a few seconds so the health check goes green before the backfill load.
  setTimeout(() => {
    try {
      autoBackfillIfNeeded(getDb())
    } catch (err) {
      console.error('[autobackfill] could not start:', err)
    }
  }, 8000)
})
