import { Router, Request, Response } from 'express'
import { readCache, writeCache, readStale } from '../cache.js'
import { getLeagues } from '../config/leagues.js'

const router = Router()

// Legacy single-league routes target the default (first) configured league
// unless LEAGUE_ID is explicitly set. PLAN.md §3 backward-compat.
const LEAGUE_ID = process.env.LEAGUE_ID || getLeagues()[0].currentLeagueId
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

// ── Rookie pick trades ────────────────────────────────────────────────────────
router.get('/league/traded-picks', (req, res) => {
  void cached(req, res, 'traded_picks', `${SLEEPER_BASE}/league/${LEAGUE_ID}/traded_picks`, 5 * 60)
})

// ── Transactions by week ──────────────────────────────────────────────────────
router.get('/league/transactions/:week', (req, res) => {
  const { week } = req.params
  void cached(req, res, `transactions_${week}`, `${SLEEPER_BASE}/league/${LEAGUE_ID}/transactions/${week}`, 2 * 60)
})

// ── Draft ID shortcut (reuses cached league data) ────────────────────────────
router.get('/league/draft-id', async (req, res) => {
  const hit = readCache('league', 30 * 60)
  if (hit != null) {
    const league = hit as { draft_id?: string }
    res.json({ draftId: league.draft_id ?? null })
    return
  }
  try {
    const data = await sleeperFetch(`${SLEEPER_BASE}/league/${LEAGUE_ID}`) as { draft_id?: string }
    writeCache('league', data)
    res.json({ draftId: data.draft_id ?? null })
  } catch (err) {
    const stale = readStale('league') as { draft_id?: string } | null
    if (stale != null) {
      res.setHeader('X-Cache-Stale', 'true')
      res.json({ draftId: stale.draft_id ?? null })
    } else {
      console.error('[sleeper draft-id]', err)
      res.status(502).json({ error: 'League data unavailable.' })
    }
  }
})

// ── Draft picks (short TTL — live during draft) ───────────────────────────────
router.get('/draft/:draftId/picks', (req, res) => {
  const { draftId } = req.params
  void cached(req, res, `draft_picks_${draftId}`, `${SLEEPER_BASE}/draft/${draftId}/picks`, 15)
})

// ── FantasyCalc dynasty rankings ─────────────────────────────────────────────
router.get('/rankings', async (req, res) => {
  const key = 'rankings_fantasycalc'
  const ttl = 6 * 60 * 60
  const url = 'https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&ppr=1&isSuperflex=true'

  const hit = readCache(key, ttl)
  if (hit != null) {
    res.json(hit)
    return
  }
  try {
    const fetchRes = await fetch(url, {
      headers: { 'User-Agent': 'SDFF-Website/1.0' },
    })
    if (!fetchRes.ok) throw new Error(`FantasyCalc returned ${fetchRes.status}`)
    const data = await fetchRes.json()
    writeCache(key, data)
    res.json(data)
  } catch (err) {
    const stale = readStale(key)
    if (stale != null) {
      res.setHeader('X-Cache-Stale', 'true')
      res.json(stale)
    } else {
      console.error('[rankings] FantasyCalc unavailable:', err)
      res.status(502).json({ error: 'FantasyCalc API unavailable.' })
    }
  }
})

// ── KTC dynasty rankings (may block server fetches — graceful fallback) ───────
router.get('/rankings/ktc', async (req, res) => {
  const key = 'rankings_ktc'
  const ttl = 6 * 60 * 60

  const hit = readCache(key, ttl)
  if (hit != null) {
    res.json(hit)
    return
  }
  try {
    const fetchRes = await fetch('https://keeptradecut.com/dynasty-rankings?format=2', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SDFF-Website/1.0)',
        'Accept': 'application/json',
      },
    })
    if (!fetchRes.ok) throw new Error(`KTC returned ${fetchRes.status}`)
    const data = await fetchRes.json()
    writeCache(key, data)
    res.json(data)
  } catch (err) {
    console.warn('[rankings] KTC fetch failed (server-side block likely):', err)
    const stale = readStale(key)
    if (stale != null) {
      res.setHeader('X-Cache-Stale', 'true')
      res.json(stale)
    } else {
      res.json([])  // graceful empty fallback — do not 502
    }
  }
})

// ── KTC Superflex JSON rankings ───────────────────────────────────────────────
router.get('/ktc/rankings', async (_req, res) => {
  const key = 'ktc-superflex'
  const ttl = 24 * 60 * 60
  const url = 'https://api.keeptradecut.com/dynasty-rankings?format=1&count=500&type=1'

  const hit = readCache(key, ttl)
  if (hit != null) {
    res.json(hit)
    return
  }
  try {
    const fetchRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SDFF-Website/1.0)',
        'Accept': 'application/json',
      },
    })
    if (!fetchRes.ok) throw new Error(`KTC returned ${fetchRes.status}`)
    const data = await fetchRes.json()
    if (Array.isArray(data) && data.length > 0) {
      console.log('[ktc/rankings] first element keys:', Object.keys(data[0] as object))
    }
    writeCache(key, data)
    res.json(data)
  } catch (err) {
    console.warn('[ktc/rankings] fetch failed (server-side block likely):', err)
    const stale = readStale(key)
    if (stale != null) {
      res.setHeader('X-Cache-Stale', 'true')
      res.json(stale)
    } else {
      res.json([])
    }
  }
})

// ── Sleeper season stats (actual pts_ppr totals for a completed season) ───────
router.get('/stats/:season', (req, res) => {
  const { season } = req.params
  void cached(req, res, `stats-${season}`, `${SLEEPER_BASE}/stats/nfl/regular/${season}`, 24 * 3600)
})

export default router
