import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import sleeperRouter from './routes/sleeper.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const REQUIRED_ENV = ['LEAGUE_ID', 'SITE_PASSWORD'] as const
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[startup] Missing required env var: ${key}`)
    process.exit(1)
  }
}

const app = express()
const PORT = Number(process.env.SERVER_PORT ?? 3001)
const SITE_PASSWORD = process.env.SITE_PASSWORD as string
const IS_DEV = process.env.NODE_ENV !== 'production'

// Health check — no auth required so Docker/TrueNAS can probe the container
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// HTTP Basic Auth — protects all routes below
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

  res.setHeader('WWW-Authenticate', 'Basic realm="SDFF"')
  res.status(401).send('Unauthorized')
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

// Sleeper API proxy with caching
app.use('/api', sleeperRouter)

// Static files (production build)
const distPath = path.join(__dirname, '..', 'dist')
app.use(express.static(distPath))

// SPA fallback — Express 5 requires named wildcard
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`SDFF server running on http://localhost:${PORT}`)
  if (IS_DEV) console.log('[dev] Basic Auth is enabled (password from SITE_PASSWORD env)')
})
