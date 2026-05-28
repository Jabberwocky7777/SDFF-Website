import express, { Router, Request, Response } from 'express'
import fs from 'fs'
import path from 'path'
import { readCache, writeCache, readStale } from '../cache.js'

const router = Router()

const LEAGUE_ID = process.env.LEAGUE_ID!
const SLEEPER_BASE = 'https://api.sleeper.app/v1'
const CACHE_DIR = process.env.CACHE_DIR ?? path.join(process.cwd(), 'cache')
const FLOCK_FILE = path.join(CACHE_DIR, 'flock-rankings.csv')
const FLOCK_DEFAULT = path.join(process.cwd(), 'server', 'data', 'flock-rankings-default.csv')

// In-memory cache for Flock CSV (avoids repeated disk reads during draft)
let flockCache: { text: string; cachedAt: number } | null = null
const FLOCK_TTL_MS = 60_000

// ── Sleeper proxy helpers (duplicated from sleeper.ts — not exported there) ──

async function sleeperFetch(url: string): Promise<unknown> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Sleeper returned ${res.status} for ${url}`)
  return res.json()
}

async function cached(
  req: Request,
  res: Response,
  key: string,
  url: string,
  ttlSeconds: number,
): Promise<void> {
  const hit = readCache(key, ttlSeconds)
  if (hit != null) {
    res.json(hit)
    return
  }

  try {
    const data = await sleeperFetch(url)
    writeCache(key, data)
    res.json(data)
  } catch (err) {
    const stale = readStale(key)
    if (stale != null) {
      res.setHeader('X-Cache-Stale', 'true')
      res.json(stale)
    } else {
      console.error('[draft]', err)
      res.status(502).json({ error: 'Sleeper API unavailable and no cache found.' })
    }
  }
}

// ── Flock rankings ────────────────────────────────────────────────────────────

router.get('/flock-rankings', (_req, res) => {
  const now = Date.now()

  // In-memory cache hit
  if (flockCache && now - flockCache.cachedAt < FLOCK_TTL_MS) {
    res.setHeader('Content-Type', 'text/plain')
    res.send(flockCache.text)
    return
  }

  // Try user-uploaded file first, then fall back to bundled default
  let text: string
  try {
    text = fs.readFileSync(FLOCK_FILE, 'utf8')
  } catch {
    try {
      text = fs.readFileSync(FLOCK_DEFAULT, 'utf8')
    } catch (err) {
      console.error('[draft] flock-rankings default file missing:', err)
      res.status(500).json({ error: 'Flock rankings file not found.' })
      return
    }
  }

  flockCache = { text, cachedAt: now }
  res.setHeader('Content-Type', 'text/plain')
  res.send(text)
})

router.post(
  '/flock-rankings',
  express.text({ type: 'text/plain', limit: '1mb' }),
  (req, res) => {
    const body = req.body as string

    if (typeof body !== 'string' || !body.trim()) {
      res.status(400).json({ error: 'Request body must be CSV text.' })
      return
    }

    const lines = body.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length < 2) {
      res.status(400).json({ error: 'CSV must have a header row and at least one data row.' })
      return
    }

    // Validate header columns
    const headerCols = lines[0].split(',').map((c) => c.trim().toLowerCase())
    if (!headerCols.includes('name')) {
      res.status(400).json({ error: 'CSV header must contain a "Name" column.' })
      return
    }
    if (!headerCols.includes('expert rank')) {
      res.status(400).json({ error: 'CSV header must contain an "Expert Rank" column.' })
      return
    }

    const dataRows = lines.slice(1)
    if (dataRows.length < 10) {
      res.status(400).json({ error: `CSV must contain at least 10 data rows (found ${dataRows.length}).` })
      return
    }

    // Atomic write to CACHE_DIR
    try {
      fs.mkdirSync(CACHE_DIR, { recursive: true })
      const tmp = FLOCK_FILE + '.tmp'
      fs.writeFileSync(tmp, body, 'utf8')
      fs.renameSync(tmp, FLOCK_FILE)
    } catch (err) {
      console.error('[draft] flock-rankings write error:', err)
      res.status(500).json({ error: 'Failed to save rankings file.' })
      return
    }

    // Bust in-memory cache
    flockCache = null

    res.json({ success: true, count: dataRows.length })
  },
)

// ── Draft metadata ────────────────────────────────────────────────────────────

router.get('/league/drafts', (req, res) => {
  void cached(req, res, 'league_drafts', `${SLEEPER_BASE}/league/${LEAGUE_ID}/drafts`, 5 * 60)
})

router.get('/draft/:draftId', (req, res) => {
  const { draftId } = req.params
  void cached(req, res, `draft_meta_${draftId}`, `${SLEEPER_BASE}/draft/${draftId}`, 5 * 60)
})

export default router
