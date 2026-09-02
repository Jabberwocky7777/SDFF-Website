import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import sleeperRouter from './routes/sleeper.js'
import announcementsRouter from './routes/announcements.js'
import draftRouter from './routes/draft.js'
import adminRouter from './routes/admin.js'
import { getLeagues, loadLeaguesConfig, toPublicLeague } from './config/leagues.js'
import { getDb } from './db/index.js'

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
} catch (err) {
  console.error('[startup] SQLite init failed (historical routes will be unavailable):', err)
}

if (!process.env.ADMIN_PASSWORD) {
  console.warn('[startup] ADMIN_PASSWORD not set — announcements admin endpoint will be disabled')
}

const app = express()
const PORT = Number(process.env.SERVER_PORT ?? 3001)
const SITE_PASSWORD = process.env.SITE_PASSWORD as string
const IS_DEV = process.env.NODE_ENV !== 'production'

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

// HTTP Basic Auth — protects all /api/* routes below
app.use((req, res, next) => {
  const authHeader = req.headers.authorization

  if (authHeader && authHeader.startsWith('Basic ')) {
    const encoded = authHeader.slice('Basic '.length)
    const decoded = Buffer.from(encoded, 'base64').toString('utf8')
    const colonIdx = decoded.indexOf(':')
    const password = colonIdx >= 0 ? decoded.slice(colonIdx + 1) : decoded

    if (password === SITE_PASSWORD) {
      return next()
    }
  }

  // Return JSON 401 — no WWW-Authenticate header so browser dialog never appears
  res.status(401).json({ error: 'unauthorized' })
})

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

// Auth check endpoint — lightweight, just validates credentials
app.get('/api/me', (_req, res) => {
  res.json({ ok: true })
})

// Configured leagues (safe fields only — never the access codes)
app.get('/api/leagues', (_req, res) => {
  res.json(getLeagues().map(toPublicLeague))
})

// Sleeper API proxy with caching
app.use('/api', sleeperRouter)

// Announcements
app.use('/api', announcementsRouter)

// Draft board (Flock rankings upload + draft metadata proxy)
app.use('/api', draftRouter)

// Editable admin data (dues, championship history, squad pot)
app.use('/api', adminRouter)

app.listen(PORT, () => {
  console.log(`SDFF server running on http://localhost:${PORT}`)
  if (IS_DEV) console.log('[dev] Basic Auth is enabled (password from SITE_PASSWORD env)')
})
