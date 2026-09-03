/**
 * Tombstones for the pre-multi-league API.
 *
 * Before leagues were siloed under /l/:slug there was a single-league proxy
 * mounted on bare paths (/api/league, /api/rosters, /api/matchups/:week, …).
 * Every one of those is now served per league from /api/leagues/:slug/live/*,
 * and nothing in the frontend has referenced the old shape since the hub
 * landed.
 *
 * They are answered with 410 rather than simply deleted so that an unnoticed
 * consumer is distinguishable from a typo: httpLogger already emits a warn
 * line for any 4xx, so `status: 410` in the logs means something still calls
 * the old API. Once those stay quiet, this file and its mount in index.ts can
 * go.
 */
import { Router } from 'express'

const GONE_PATHS = [
  '/league',
  '/league/traded-picks',
  '/league/transactions/:week',
  '/league/draft-id',
  '/league/drafts',
  '/users',
  '/rosters',
  '/matchups/:week',
  '/state',
  '/players',
  '/draft/:draftId',
  '/draft/:draftId/picks',
  '/rankings',
  '/rankings/ktc',
  '/ktc/rankings',
  '/ktc-rankings',
  '/fantasycalc-rankings',
  '/flock-rankings',
  '/stats/:season',
]

const router = Router()

for (const path of GONE_PATHS) {
  router.all(path, (_req, res) => {
    res.status(410).json({
      error: 'This endpoint was removed. Use /api/leagues/:slug/live/* instead.',
    })
  })
}

export default router
