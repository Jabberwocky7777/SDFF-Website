/**
 * Namespaced per-league API.
 *
 *   GET /api/leagues/:slug                     league meta + seasons + capabilities
 *   GET /api/leagues/:slug/standings?season=   career or single-season table
 *   GET /api/leagues/:slug/history             season list with champions
 *   GET /api/leagues/:slug/timeline            manager × season final-rank grid
 *   GET /api/leagues/:slug/records             records book
 *   GET /api/leagues/:slug/h2h                 head-to-head matrix
 *   GET /api/leagues/:slug/h2h/:a/vs/:b        head-to-head game log
 *   GET /api/leagues/:slug/managers            career table (= standings)
 *   GET /api/leagues/:slug/managers/:userId    one manager's profile
 *   GET /api/leagues/:slug/live/{league,users,rosters,matchups/:week}
 *
 * `:slug` is validated against config by `requireLeagueAccess` (mounted in
 * index.ts), so handlers can trust it.
 */
import express, { Router, type Request } from 'express'
import { getDb } from '../db/index.js'
import { getLeague } from '../config/leagues.js'
import { requireAdmin } from '../auth/middleware.js'
import { readCache, readStale, writeCache } from '../cache.js'
import { getSleeperClient } from '../sleeper/client.js'
import { fetchKtcHtmlRankings, readFlockCsv, writeFlockCsv } from '../sleeper/external.js'
import { isGameDay, serveCached, serveCachedUrl } from '../sleeper/proxy.js'
import {
  getFamily,
  getH2HGameLog,
  getH2HMatrix,
  getManagers,
  getRecordsBook,
  getSeasons,
  getStandings,
  getTimeline,
} from '../analytics/queries.js'
import { getAllPlay } from '../analytics/allplay.js'
import { getPowerRankings } from '../analytics/powerRankings.js'
import { getTradeDetail, getTradeFeed } from '../analytics/trades.js'
import { getDraftBoard, getDraftSeasons } from '../analytics/drafts.js'
import { getMatchupWeeks, getWeekMatchups } from '../analytics/matchups.js'
import { getBracketSeasons, getSeasonBracket } from '../analytics/brackets.js'
import { log } from '../log.js'

const router = Router({ mergeParams: true })

/** `:slug` is set on the mount path in index.ts; mergeParams surfaces it here. */
function params(req: Request): Record<string, string> {
  return req.params as Record<string, string>
}

function currentLeagueId(slug: string): string {
  return getLeague(slug)!.currentLeagueId
}

router.get('/', (req, res) => {
  const db = getDb()
  const slug = params(req).slug
  const family = getFamily(db, slug)
  const cfg = getLeague(slug)!
  const seasons = getSeasons(db, slug)

  let lastSyncAt: number | null = null
  if (family) {
    const row = db
      .prepare(
        `SELECT MAX(sl.finished_at) AS last
         FROM sync_log sl
         WHERE sl.status = 'ok'
           AND sl.league_id IN (SELECT league_id FROM league_season WHERE family_id = ?)`,
      )
      .get(family.id) as { last: number | null } | undefined
    lastSyncAt = row?.last ?? null
  }

  res.json({
    slug,
    displayName: cfg.displayName,
    type: cfg.type,
    theme: cfg.theme ?? null,
    ingested: !!family,
    latestCapabilities: seasons[0]?.capabilities ?? null,
    lastSyncAt,
    seasons,
  })
})

router.get('/standings', (req, res) => {
  const season = req.query.season ? Number(req.query.season) : undefined
  res.json(getStandings(getDb(), params(req).slug, Number.isFinite(season) ? season : undefined))
})

router.get('/history', (req, res) => {
  res.json(getSeasons(getDb(), params(req).slug))
})

router.get('/timeline', (req, res) => {
  res.json(getTimeline(getDb(), params(req).slug))
})

router.get('/records', (req, res) => {
  res.json(getRecordsBook(getDb(), params(req).slug))
})

router.get('/allplay', (req, res) => {
  const season = req.query.season ? Number(req.query.season) : undefined
  res.json(getAllPlay(getDb(), params(req).slug, Number.isFinite(season) ? season : undefined))
})

router.get('/power-rankings', (req, res) => {
  const season = req.query.season ? Number(req.query.season) : undefined
  res.json(getPowerRankings(getDb(), params(req).slug, Number.isFinite(season) ? season : undefined))
})

router.get('/h2h', (req, res) => {
  res.json(getH2HMatrix(getDb(), params(req).slug))
})

router.get('/h2h/:userA/vs/:userB', (req, res) => {
  res.json(getH2HGameLog(getDb(), params(req).slug, params(req).userA, params(req).userB))
})

router.get('/brackets', (req, res) => {
  res.json(getBracketSeasons(getDb(), params(req).slug))
})

router.get('/brackets/:season', (req, res) => {
  const season = Number(params(req).season)
  if (!Number.isInteger(season)) {
    res.status(400).json({ error: 'season must be an integer' })
    return
  }
  const view = getSeasonBracket(getDb(), params(req).slug, season)
  if (!view) {
    res.status(404).json({ error: 'no bracket on record for that season' })
    return
  }
  res.json(view)
})

router.get('/matchups/weeks', (req, res) => {
  res.json(getMatchupWeeks(getDb(), params(req).slug))
})

router.get('/matchups/:season/:week', (req, res) => {
  const season = Number(params(req).season)
  const week = Number(params(req).week)
  if (!Number.isInteger(season) || !Number.isInteger(week)) {
    res.status(400).json({ error: 'season and week must be integers' })
    return
  }
  res.json(getWeekMatchups(getDb(), params(req).slug, season, week))
})

router.get('/managers', (req, res) => {
  res.json(getManagers(getDb(), params(req).slug))
})

router.get('/trades', (req, res) => {
  const season = req.query.season ? Number(req.query.season) : undefined
  const limit = req.query.limit ? Number(req.query.limit) : undefined
  res.json(
    getTradeFeed(getDb(), params(req).slug, {
      season: Number.isFinite(season) ? season : undefined,
      userId: typeof req.query.userId === 'string' ? req.query.userId : undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
    }),
  )
})

router.get('/trades/:tradeId', (req, res) => {
  const trade = getTradeDetail(getDb(), params(req).slug, params(req).tradeId)
  if (!trade) {
    res.status(404).json({ error: 'trade not found in this league' })
    return
  }
  res.json(trade)
})

// ── Historical draft boards ─────────────────────────────────────────────────

router.get('/drafts', (req, res) => {
  res.json(getDraftSeasons(getDb(), params(req).slug))
})

router.get('/drafts/:season', (req, res) => {
  const season = Number(params(req).season)
  if (!Number.isInteger(season)) {
    res.status(400).json({ error: 'bad season' })
    return
  }
  const board = getDraftBoard(getDb(), params(req).slug, season)
  if (!board) {
    res.status(404).json({ error: 'no draft on record for that season' })
    return
  }
  res.json(board)
})

router.get('/managers/:userId', (req, res) => {
  const db = getDb()
  const slug = params(req).slug, userId = params(req).userId
  const career = getManagers(db, slug).find((m) => m.userId === userId)
  if (!career) {
    res.status(404).json({ error: 'manager not found in this league' })
    return
  }
  const matrix = getH2HMatrix(db, slug)
  const vs = matrix.cells[userId] ?? {}
  const opponents = Object.entries(vs)
    .map(([oppId, cell]) => ({
      userId: oppId,
      name: matrix.managers.find((m) => m.userId === oppId)?.name ?? oppId,
      ...cell.combined,
    }))
    .filter((o) => o.meetings >= 3)
  const nemesis = [...opponents].sort(
    (a, b) => a.wins / Math.max(1, a.wins + a.losses) - b.wins / Math.max(1, b.wins + b.losses),
  )[0]
  const favorite = [...opponents].sort(
    (a, b) => b.wins / Math.max(1, b.wins + b.losses) - a.wins / Math.max(1, a.wins + a.losses),
  )[0]

  res.json({
    career,
    seasons: getSeasons(db, slug).filter((s) =>
      getStandings(db, slug, s.season).some((r) => r.userId === userId),
    ),
    perSeason: getSeasons(db, slug)
      .map((s) => ({
        season: s.season,
        row: getStandings(db, slug, s.season).find((r) => r.userId === userId) ?? null,
      }))
      .filter((x) => x.row),
    nemesis: nemesis ?? null,
    favorite: favorite ?? null,
  })
})

// ── Live proxy (volatile — file cache, short TTL) ────────────────────────────

router.get('/live/league', (req, res) => {
  const id = currentLeagueId(params(req).slug)
  void serveCached(res, `lg_${id}_league`, `/league/${id}`, 30 * 60)
})

router.get('/live/users', (req, res) => {
  const id = currentLeagueId(params(req).slug)
  void serveCached(res, `lg_${id}_users`, `/league/${id}/users`, 30 * 60)
})

router.get('/live/rosters', (req, res) => {
  const id = currentLeagueId(params(req).slug)
  void serveCached(res, `lg_${id}_rosters`, `/league/${id}/rosters`, 30 * 60)
})

router.get('/live/matchups/:week', (req, res) => {
  const id = currentLeagueId(params(req).slug)
  const week = Number(params(req).week)
  if (!Number.isInteger(week) || week < 1 || week > 25) {
    res.status(400).json({ error: 'bad week' })
    return
  }
  const ttl = isGameDay() ? 3 * 60 : 30 * 60
  void serveCached(res, `lg_${id}_matchups_${week}`, `/league/${id}/matchups/${week}`, ttl)
})

router.get('/live/transactions/:week', (req, res) => {
  const id = currentLeagueId(params(req).slug)
  const week = Number(params(req).week)
  if (!Number.isInteger(week) || week < 1 || week > 25) {
    res.status(400).json({ error: 'bad week' })
    return
  }
  void serveCached(res, `lg_${id}_txn_${week}`, `/league/${id}/transactions/${week}`, 2 * 60)
})

router.get('/live/traded-picks', (req, res) => {
  const id = currentLeagueId(params(req).slug)
  void serveCached(res, `lg_${id}_traded_picks`, `/league/${id}/traded_picks`, 5 * 60)
})

router.get('/live/drafts', (req, res) => {
  const id = currentLeagueId(params(req).slug)
  void serveCached(res, `lg_${id}_drafts`, `/league/${id}/drafts`, 5 * 60)
})

/** draft_id lives on the league object — reuse its cache rather than a 2nd call. */
router.get('/live/draft-id', async (req, res) => {
  const id = currentLeagueId(params(req).slug)
  const key = `lg_${id}_league`
  const hit = readCache(key, 30 * 60) as { draft_id?: string } | null
  if (hit) {
    res.json({ draftId: hit.draft_id ?? null })
    return
  }
  try {
    const data = (await getSleeperClient().raw(
      `https://api.sleeper.app/v1/league/${id}`,
    )) as { draft_id?: string }
    writeCache(key, data)
    res.json({ draftId: data?.draft_id ?? null })
  } catch {
    const stale = readStale(key) as { draft_id?: string } | null
    res.json({ draftId: stale?.draft_id ?? null })
  }
})

router.get('/live/draft/:draftId', (req, res) => {
  const draftId = params(req).draftId
  if (!/^\d+$/.test(draftId)) {
    res.status(400).json({ error: 'bad draft id' })
    return
  }
  void serveCached(res, `draft_meta_${draftId}`, `/draft/${draftId}`, 5 * 60)
})

router.get('/live/draft/:draftId/picks', (req, res) => {
  const draftId = params(req).draftId
  if (!/^\d+$/.test(draftId)) {
    res.status(400).json({ error: 'bad draft id' })
    return
  }
  void serveCached(res, `draft_picks_${draftId}`, `/draft/${draftId}/picks`, 3)
})

// ── Global references (not league-specific, but gated behind league access) ──

router.get('/live/state', (_req, res) => {
  void serveCached(res, 'nfl_state', '/state/nfl', 30 * 60)
})

router.get('/live/players', (_req, res) => {
  void serveCached(res, 'nfl_players', '/players/nfl', 24 * 60 * 60)
})

router.get('/live/stats/:season', (req, res) => {
  const season = Number(params(req).season)
  if (!Number.isInteger(season) || season < 2015 || season > 2100) {
    res.status(400).json({ error: 'bad season' })
    return
  }
  void serveCached(res, `stats_${season}`, `/stats/nfl/regular/${season}`, 24 * 60 * 60)
})

router.get('/live/rankings', (_req, res) => {
  void serveCachedUrl(
    res,
    'rankings_fantasycalc',
    'https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&ppr=1&isSuperflex=true',
    6 * 60 * 60,
  )
})

router.get('/live/fantasycalc-rankings', (_req, res) => {
  void serveCachedUrl(
    res,
    'fantasycalc_rankings',
    // NB: FantasyCalc dropped the `tep` param — it now 404s. Plain superflex only.
    'https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&ppr=1&isSuperflex=true',
    60 * 60,
  )
})

router.get('/live/ktc/rankings', (_req, res) => {
  void serveCachedUrl(
    res,
    'ktc-superflex',
    'https://api.keeptradecut.com/dynasty-rankings?format=1&count=500&type=1',
    24 * 60 * 60,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SDFF-Website/1.0)',
        Accept: 'application/json',
      },
      emptyOnError: true,
    },
  )
})

router.get('/live/ktc-rankings', (_req, res) => {
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

router.get('/live/flock-rankings', (_req, res) => {
  try {
    res.type('text/plain').send(readFlockCsv())
  } catch (err) {
    log.error('flock rankings read failed', { err: (err as Error).message })
    res.status(500).json({ error: 'Flock rankings file not found.' })
  }
})

// Admin-only: writeFlockCsv targets one hub-wide file, so this is a
// cross-league write and a member of any single league should not hold it.
router.post(
  '/live/flock-rankings',
  requireAdmin,
  express.json({ limit: '2mb' }),
  (req, res) => {
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
  },
)

export default router
