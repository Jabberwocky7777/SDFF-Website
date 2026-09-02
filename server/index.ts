import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import sleeperRouter from './routes/sleeper.js'
import announcementsRouter from './routes/announcements.js'
import draftRouter from './routes/draft.js'
import adminRouter from './routes/admin.js'
import authRouter from './routes/auth.js'
import leaguesRouter from './routes/leagues.js'
import { getLeagues, loadLeaguesConfig, toPublicLeague } from './config/leagues.js'
import { getDb } from './db/index.js'
import { startScheduler } from './sync/scheduler.js'
import { attachAuth, requireAuth, requireLeagueAccess } from './auth/middleware.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

if (!process.env.SITE_PASSWORD) {
  console.error('[startup] Missing required env var: SITE_PASSWORD')
  process.exit(1)
}

// League config: either config/leagues.json or a LEAGUE_ID env-var fallback.
try {
  const config = loadLeaguesConfig()
  console.log(
    `[startup] leagues: ${config.leagues.map((l) => l.slug).join(', ')}`,
  )
} catch (err) {
  console.error(`[startup] ${(err as Error).message}`)
  process.exit(1)
}

// Open the SQLite DB and run migrations. A DB failure must not take down the
// live proxy, so this is best-effort during the multi-league migration.
try {
  getDb()
  console.log('[startup] SQLite ready')
  startScheduler()
} catch (err) {
  console.error('[startup] SQLite init failed (historical routes will be unavailable):', err)
}

if (!process.env.ADMIN_PASSWORD) {
  console.warn('[startup] ADMIN_PASSWORD not set — announcements admin endpoint will be disabled')
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

// Populate req.auth from the session cookie or legacy Basic Auth (never rejects).
app.use(attachAuth)

// Auth endpoints (login must be reachable without prior auth).
app.use('/api', authRouter)

// Legacy credential check — kept for the current frontend / Vite dev proxy.
app.get('/api/me', requireAuth, (_req, res) => {
  res.json({ ok: true })
})

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

// Sleeper API proxy with caching (legacy single-league — default league)
app.use('/api', sleeperRouter)

// Announcements
app.use('/api', announcementsRouter)

// Draft board (Flock rankings upload + draft metadata proxy)
app.use('/api', draftRouter)

// Editable admin data (dues, championship history, squad pot)
app.use('/api', adminRouter)

app.listen(PORT, () => {
  console.log(`SDFF server running on http://localhost:${PORT}`)
  if (IS_DEV) {
    console.log('[dev] auth: session cookie or legacy Basic Auth (SITE_PASSWORD)')
  }
})
