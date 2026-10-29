/**
 * KTC value ingest — the catalogue refresh, the daily snapshot, the bulk
 * history feed, and the per-player all-time top-up.
 *
 * Shared by `npm run ktc:backfill` and the scheduler so both take exactly the
 * same path. Every write is an upsert, so running either twice is a no-op.
 *
 * Cost model, which is why this is split into stages:
 *   - the rankings page is ~3 MB and gives today's value for all 500 assets;
 *   - the histories feed is ~10 MB and gives a rolling 180 days for all of them;
 *   - a player page is ~4 MB and gives one asset's full series back to 2020.
 * So stages 1 and 2 are cheap enough to run daily, and stage 3 only ever runs
 * for assets in a trade older than what stages 1–2 could reach.
 */
import type { DB } from '../db/index.js'
import { log } from '../log.js'
import { nyDateString, shiftDate } from '../lib/nyDate.js'
import {
  errMessage,
  fetchHistories,
  fetchPlayerAllTime,
  fetchRankings,
  PLAYER_PAGE_DELAY_MS,
  sleep,
} from '../ktc/client.js'
import { matchKtcAssets, type MatchReport } from '../ktc/match.js'
import {
  coverage,
  earliestFor,
  readMatchOverrides,
  readSleeperPlayers,
  upsertAssets,
  upsertSnapshot,
  upsertValues,
} from '../ktc/store.js'
import { KTC_LOOKBACK_DAYS } from '../analytics/ktc.js'

export interface CatalogueResult {
  assets: number
  matched: number
  unmatched: string[]
  ambiguous: string[]
  snapshotRows: number
  historiesVersion: string | null
}

/**
 * Stage 1 — refresh the asset catalogue, re-run the Sleeper match, and store
 * today's values.
 */
export async function refreshCatalogue(db: DB): Promise<CatalogueResult> {
  const { assets, historiesVersion } = await fetchRankings()
  const match: MatchReport = matchKtcAssets(
    assets,
    readSleeperPlayers(db),
    readMatchOverrides(db),
  )
  upsertAssets(db, assets, match)
  const snapshotRows = upsertSnapshot(db, assets)

  return {
    assets: assets.length,
    matched: match.byKtcId.size,
    unmatched: match.unmatched.map((a) => `${a.playerName} (${a.position})`),
    ambiguous: match.ambiguous.map((a) => `${a.name} (${a.position}) → ${a.candidates.join(', ')}`),
    snapshotRows,
    historiesVersion,
  }
}

/** Stage 2 — the 180-day feed for every ranked asset. */
export async function ingestHistories(db: DB, version: string | null): Promise<number> {
  const series = await fetchHistories(version)
  return upsertValues(db, series)
}

export interface MissingAsset {
  ktcId: number
  slug: string
  name: string
  /** The oldest trade date that needs this asset. */
  neededFrom: string
}

/**
 * Which assets are in a dynasty trade that predates the history we hold for
 * them. These are the only ones worth a player-page fetch.
 */
export function assetsNeedingHistory(db: DB): MissingAsset[] {
  const rows = db
    .prepare(
      `SELECT ka.ktc_id AS ktcId, ka.slug AS slug, ka.name AS name,
              MIN(t.created_ms) AS firstMs
       FROM trade t
       JOIN league_family f ON f.id = t.family_id
       JOIN trade_asset ta ON ta.trade_id = t.id
       JOIN ktc_asset ka ON ka.player_id = ta.player_id
       WHERE f.league_type = 'dynasty'
         AND ta.asset_type = 'player'
         AND t.created_ms IS NOT NULL
       GROUP BY ka.ktc_id, ka.slug, ka.name`,
    )
    .all() as Array<{ ktcId: number; slug: string; name: string; firstMs: number }>

  const out: MissingAsset[] = []
  for (const r of rows) {
    const needed = shiftDate(nyDateString(r.firstMs), -KTC_LOOKBACK_DAYS)
    const have = earliestFor(db, r.ktcId)
    if (have === null || have > needed) {
      out.push({ ktcId: r.ktcId, slug: r.slug, name: r.name, neededFrom: needed })
    }
  }
  return out
}

export interface TopUpResult {
  attempted: number
  succeeded: number
  rows: number
  failures: string[]
}

/**
 * Stage 3 — one player page per asset that stage 2 could not reach far enough
 * back for. Sequential, with a delay between requests.
 */
export async function topUpFromPlayerPages(
  db: DB,
  missing: readonly MissingAsset[],
  onProgress?: (m: MissingAsset, i: number) => void,
): Promise<TopUpResult> {
  const result: TopUpResult = { attempted: 0, succeeded: 0, rows: 0, failures: [] }
  for (const [i, asset] of missing.entries()) {
    if (i > 0) await sleep(PLAYER_PAGE_DELAY_MS)
    result.attempted++
    onProgress?.(asset, i)
    try {
      const points = await fetchPlayerAllTime(asset.slug)
      result.rows += upsertValues(db, new Map([[asset.ktcId, points]]))
      result.succeeded++
    } catch (err) {
      result.failures.push(`${asset.name}: ${errMessage(err)}`)
    }
  }
  return result
}

/**
 * The daily job. Always refreshes the catalogue and today's values; refetches
 * the 180-day feed only when the newest stored date is more than a day old, so
 * a gap left by downtime heals itself without pulling 10 MB every morning.
 *
 * Never throws: a KTC layout change must not take the sync down, and the trade
 * page keeps rendering from whatever is already stored.
 */
export async function runKtcDaily(db: DB): Promise<void> {
  try {
    const before = coverage(db)
    const cat = await refreshCatalogue(db)
    log.info('ktc snapshot stored', {
      assets: cat.assets,
      matched: cat.matched,
      unmatched: cat.unmatched.length,
      rows: cat.snapshotRows,
    })
    if (cat.ambiguous.length > 0) {
      log.warn('ktc ambiguous matches skipped', { entries: cat.ambiguous })
    }

    const yesterday = shiftDate(nyDateString(Date.now()), -1)
    if (before.latest === null || before.latest < yesterday) {
      const rows = await ingestHistories(db, cat.historiesVersion)
      log.info('ktc histories backfilled', { rows, since: before.latest })
    }
  } catch (err) {
    log.error('ktc daily failed — serving stored values', { err: errMessage(err) })
  }
}
