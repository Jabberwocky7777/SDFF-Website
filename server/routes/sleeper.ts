import { Router, Request, Response } from 'express'
import { readCache, writeCache, readStale } from '../cache.js'

const router = Router()

const LEAGUE_ID = process.env.LEAGUE_ID!
const SLEEPER_BASE = 'https://api.sleeper.app/v1'

const GAME_DAYS = new Set([0, 1, 4]) // Sun, Mon, Thu (JS day-of-week)

function isGameDay(): boolean {
  return GAME_DAYS.has(new Date().getDay())
}

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
      console.error('[sleeper]', err)
      res.status(502).json({ error: 'Sleeper API unavailable and no cache found.' })
    }
  }
}

router.get('/league', (req, res) => {
  void cached(req, res, 'league', `${SLEEPER_BASE}/league/${LEAGUE_ID}`, 30 * 60)
})

router.get('/users', (req, res) => {
  void cached(req, res, 'users', `${SLEEPER_BASE}/league/${LEAGUE_ID}/users`, 30 * 60)
})

router.get('/rosters', (req, res) => {
  void cached(req, res, 'rosters', `${SLEEPER_BASE}/league/${LEAGUE_ID}/rosters`, 30 * 60)
})

router.get('/matchups/:week', (req, res) => {
  const { week } = req.params
  const ttl = isGameDay() ? 5 * 60 : 30 * 60
  void cached(req, res, `matchups_${week}`, `${SLEEPER_BASE}/league/${LEAGUE_ID}/matchups/${week}`, ttl)
})

router.get('/state', (req, res) => {
  void cached(req, res, 'state', `${SLEEPER_BASE}/state/nfl`, 30 * 60)
})

router.get('/players', (req, res) => {
  void cached(req, res, 'players', `${SLEEPER_BASE}/players/nfl`, 24 * 60 * 60)
})

export default router
