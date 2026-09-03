import express, { type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import announcementsRouter from './routes/announcements.js'
import legacyGoneRouter from './routes/legacy-gone.js'
import adminRouter from './routes/admin.js'
import adminLeaguesRouter from './routes/admin-leagues.js'
import authRouter from './routes/auth.js'
import setupRouter from './routes/setup.js'
import leaguesRouter from './routes/leagues.js'
import draftToolRouter from './routes/draft-tool.js'
import { getLeagues, toPublicLeague } from './config/leagues.js'
import { bootstrapLeaguesIfEmpty } from './config/bootstrap.js'
import { maybeResetAdmin } from './auth/admin.js'
import { getDb } from './db/index.js'
import { die, fatal, trace } from './fatal.js'
import { httpLogger, log } from './log.js'
import { securityHeaders } from './security.js'
import { startScheduler } from './sync/scheduler.js'
import { startBackupJob } from './sync/backup.js'
import { autoBackfillIfNeeded } from './sync/autobackfill.js'
import { attachAuth, requireAdmin, requireAuth, requireLeagueAccess } from './auth/middleware.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PORT = Number(process.env.SERVER_PORT ?? 3001)
const IS_DEV = process.env.NODE_ENV !== 'production'

trace(
  `SDFF hub — node ${process.version}, uid ${process.getuid?.() ?? '?'}, ` +
    `cwd ${process.cwd()}, CACHE_DIR ${process.env.CACHE_DIR ?? '(default)'}, port ${PORT}`,
)

process.on('unhandledRejection', (err) => fatal('unhandledRejection', err))
process.on('uncaughtException', (err) => die('uncaughtException', err))

// ── Bring up the database (best-effort) ────────────────────────────────────
// If it fails we still start the HTTP server in a diagnostic mode so the error
// is visible in a browser and the container stays up instead of crash-looping.
let dbError: string | null = null
try {
  const db = getDb()
  trace('db ready')
  maybeResetAdmin(db)
  await bootstrapLeaguesIfEmpty(db)
  const slugs = getLeagues(db).map((l) => l.slug)
  trace(`leagues: ${slugs.join(', ') || '(none — set up in the app)'}`)
  startScheduler()
  startBackupJob()
} catch (err) {
  // Message only — the diagnostic page below is served unauthenticated, and a
  // stack trace there would hand out absolute paths and module layout. The full
  // stack goes to the container log via fatal().
  dbError = err instanceof Error ? err.message : String(err)
  fatal('database initialisation failed — starting in diagnostic mode', err)
}

const app = express()
// One hop only. `true` would trust any X-Forwarded-For a client sends, which
// lets anyone rotate their apparent IP past the login rate limiter.
app.set('trust proxy', 1)

app.get('/health', (_req, res) => {
  res.json({ status: dbError ? 'degraded' : 'ok' })
})

// Diagnostic mode: DB is down. Serve a plain page explaining it, 503 everything
// else, and skip the rest of the app.
if (dbError) {
  const page = (msg: string) =>
    `<!doctype html><meta charset=utf8><title>SDFF — setup problem</title>` +
    `<body style="font:15px/1.5 system-ui;background:#111214;color:#F4EFE2;padding:2rem;max-width:46rem;margin:auto">` +
    `<h1 style="color:#E0B544">The database couldn't start</h1>` +
    `<p>The app stores its history in a SQLite file under <code>${process.env.CACHE_DIR ?? '/app/cache'}</code>. ` +
    `Something is stopping it from being created — usually the persistent volume is read-only, ` +
    `mounted at the wrong path, or unwritable.</p>` +
    `<pre style="background:#1A1C22;border:1px solid #333;padding:1rem;border-radius:8px;white-space:pre-wrap;overflow:auto">${msg
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')}</pre>` +
    `<p>Fix the volume (TrueNAS: an <b>ixVolume</b> mounted at <code>/app/cache</code>, not read-only) and restart. ` +
    `The full error and stack trace are in the container log.</p>` +
    `</body>`
  app.get('/{*splat}', (req, res) => {
    res.status(req.path === '/' ? 200 : 503).type('html').send(page(dbError!))
  })
  app.listen(PORT, () => trace(`diagnostic server listening on :${PORT}`)).on('error', (err) =>
    fatal(`could not bind port ${PORT}`, err),
  )
} else {
  // ── Normal app ──────────────────────────────────────────────────────────
  const distPath = path.join(__dirname, '..', 'dist')

  app.use(httpLogger)
  app.use(securityHeaders)

  // CORS: same-origin only in production (no middleware = browser blocks
  // cross-origin XHR). CORS_ORIGIN opts a specific front-end origin back in.
  const corsOrigin = IS_DEV ? 'http://localhost:5173' : process.env.CORS_ORIGIN
  if (corsOrigin) app.use(cors({ origin: corsOrigin, credentials: true }))

  app.use(express.static(distPath))
  app.get('/{*splat}', (_req, res, next) => {
    if (_req.path.startsWith('/api/')) return next()
    res.sendFile(path.join(distPath, 'index.html'))
  })

  // CSRF: the session cookie is SameSite=Lax, which already blocks cross-site
  // form posts. This is the second layer — an HTML form can only send
  // urlencoded, multipart or text/plain bodies, so requiring JSON on every
  // mutation means a cross-origin page cannot construct a request the API will
  // accept without a preflight it can't pass.
  app.use('/api', (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next()
    const type = req.headers['content-type']?.split(';')[0].trim().toLowerCase()
    if (type !== 'application/json') {
      res.status(415).json({ error: 'Content-Type must be application/json' })
      return
    }
    next()
  })

  app.use(express.json())

  app.use(attachAuth)
  app.use('/api', setupRouter)
  app.use('/api', authRouter)
  app.get('/api/me', requireAuth, (_req, res) => res.json({ ok: true }))
  app.use('/api/admin', requireAuth, requireAdmin)
  app.use('/api', adminLeaguesRouter)
  app.use('/api/draft-tool', requireAuth, requireAdmin, draftToolRouter)
  app.get('/api/leagues', requireAuth, (req, res) => {
    const all = getLeagues()
    const visible = req.auth?.admin ? all : all.filter((l) => req.auth?.slugs.includes(l.slug))
    res.json(visible.map(toPublicLeague))
  })
  app.use('/api/leagues/:slug', requireLeagueAccess, leaguesRouter)
  app.use('/api', requireAuth)
  app.use('/api', announcementsRouter)
  app.use('/api', legacyGoneRouter)
  app.use('/api', adminRouter)

  app.use('/api/{*splat}', (_req, res) => {
    res.status(404).json({ error: 'not found' })
  })

  // Express 5 hides stack traces from responses when NODE_ENV=production, but
  // that makes disclosure depend on an env var being set correctly. Be explicit:
  // the client gets a generic 500, the detail goes to the log.
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    log.error('unhandled route error', {
      method: req.method,
      path: req.originalUrl.split('?')[0],
      err: err.message,
      stack: err.stack,
    })
    if (res.headersSent) return
    res.status(500).json({ error: 'internal server error' })
  })

  const server = app.listen(PORT, () => {
    trace(`listening on :${PORT}`)
    if (IS_DEV) log.info('dev — open the app to set up the admin password / add leagues')
    setTimeout(() => {
      try {
        autoBackfillIfNeeded(getDb())
      } catch (err) {
        log.error('autobackfill could not start', { err: (err as Error).message })
      }
    }, 8000)
  })
  server.on('error', (err) => fatal(`could not bind port ${PORT}`, err))
}
