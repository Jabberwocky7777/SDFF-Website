/**
 * Namespaced per-league API (PLAN.md §3, §11.1).
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
import { Router, type Request } from 'express'
import { getDb } from '../db/index.js'
import { getLeague } from '../config/leagues.js'
import { isGameDay, serveCached } from '../sleeper/proxy.js'
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
  res.json({
    slug,
    displayName: cfg.displayName,
    type: cfg.type,
    theme: cfg.theme ?? null,
    ingested: !!family,
    latestCapabilities: seasons[0]?.capabilities ?? null,
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

router.get('/managers', (req, res) => {
  res.json(getManagers(getDb(), params(req).slug))
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
      ...cell,
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

export default router
