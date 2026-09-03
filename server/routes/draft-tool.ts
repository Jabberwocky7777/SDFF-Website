/**
 * Global draft-day tool (admin only) — the live Sleeper-draft board with Flock
 * rookie rankings + KTC / FantasyCalc values. None of this is league-scoped
 * (Flock is a single hub file, the ranking sources are global, and the draft is
 * addressed by its Sleeper draft id), so it lives outside `/api/leagues/:slug`.
 *
 * Mounted at `/api/draft-tool` behind requireAuth + requireAdmin in index.ts.
 */
import express, { Router } from 'express'
import { readCache, readStale, writeCache } from '../cache.js'
import { serveCached, serveCachedUrl } from '../sleeper/proxy.js'
import { fetchKtcHtmlRankings, readFlockCsv, writeFlockCsv } from '../sleeper/external.js'
import { log } from '../log.js'

const router = Router()

router.get('/players', (_req, res) => {
  void serveCached(res, 'nfl_players', '/players/nfl', 24 * 60 * 60)
})

router.get('/draft/:draftId', (req, res) => {
  const { draftId } = req.params
  if (!/^\d+$/.test(draftId)) {
    res.status(400).json({ error: 'bad draft id' })
    return
  }
  void serveCached(res, `draft_meta_${draftId}`, `/draft/${draftId}`, 5 * 60)
})

router.get('/draft/:draftId/picks', (req, res) => {
  const { draftId } = req.params
  if (!/^\d+$/.test(draftId)) {
    res.status(400).json({ error: 'bad draft id' })
    return
  }
  void serveCached(res, `draft_picks_${draftId}`, `/draft/${draftId}/picks`, 15)
})

router.get('/fantasycalc-rankings', (_req, res) => {
  void serveCachedUrl(
    res,
    'fantasycalc_rankings',
    'https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&ppr=1&isSuperflex=true',
    60 * 60,
  )
})

router.get('/ktc-rankings', (_req, res) => {
  const hit = readCache('ktc_rankings', 60 * 60)
  if (hit != null) {
    res.json(hit)
    return
  }
  void fetchKtcHtmlRankings()
    .then((data) => {
      writeCache('ktc_rankings', data)
      res.json(data)
    })
    .catch((err) => {
      const stale = readStale('ktc_rankings')
      if (stale != null) {
        res.setHeader('X-Cache-Stale', 'true')
        res.json(stale)
      } else {
        log.error('ktc rankings fetch failed', { err: (err as Error).message })
        res.status(502).json({ error: 'KTC unavailable and no cache found.' })
      }
    })
})

router.get('/flock-rankings', (_req, res) => {
  try {
    res.type('text/plain').send(readFlockCsv())
  } catch (err) {
    log.error('flock rankings read failed', { err: (err as Error).message })
    res.status(500).json({ error: 'Flock rankings file not found.' })
  }
})

// JSON-wrapped rather than a raw text/plain body: text/plain is a
// CSRF-capable content type that an HTML form can send cross-site, and
// requiring JSON on every mutation is what lets the guard in index.ts be
// unconditional.
router.post('/flock-rankings', express.json({ limit: '2mb' }), (req, res) => {
  const body = (req.body as { csv?: unknown })?.csv
  if (typeof body !== 'string' || !body.trim()) {
    res.status(400).json({ error: 'Request body must be { csv: "..." }.' })
    return
  }
  try {
    res.json({ success: true, count: writeFlockCsv(body) })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to save.' })
  }
})

export default router
