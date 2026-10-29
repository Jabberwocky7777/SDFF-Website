/**
 * One-time (and re-runnable) KeepTradeCut value backfill.
 *
 *   npm run ktc:backfill                 # catalogue + 180-day feed + top-ups
 *   npm run ktc:backfill -- --no-pages   # skip the per-player all-time fetches
 *   npm run ktc:backfill -- --dry-run    # report coverage and matching, write nothing
 *
 * Stages, cheapest first (see server/sync/ktc.ts):
 *   1. the rankings page — today's values for all ~500 assets, and the Sleeper
 *      name match, stored so it never has to run per request;
 *   2. `/dynasty-rankings/histories` — a rolling 180 days of daily values for
 *      every ranked asset, in one request;
 *   3. a player page per asset that appears in a dynasty trade older than what
 *      stage 2 reached. These are ~4 MB each, so they are fetched sequentially
 *      with a delay and only where they are actually needed.
 *
 * The closing summary is the thing to read: how far back values now go, which
 * traded players never matched, and which trades still cannot be priced.
 */
import { closeDb, getDb } from '../db/index.js'
import {
  assetsNeedingHistory,
  ingestHistories,
  refreshCatalogue,
  topUpFromPlayerPages,
} from '../sync/ktc.js'
import { coverage } from '../ktc/store.js'
import { errMessage } from '../ktc/client.js'
import { KTC_LOOKBACK_DAYS } from '../analytics/ktc.js'
import { nyDateString, shiftDate } from '../lib/nyDate.js'
import type { DB } from '../db/index.js'

interface Args {
  pages: boolean
  dryRun: boolean
}

function parseArgs(argv: string[]): Args {
  const out: Args = { pages: true, dryRun: false }
  for (const arg of argv) {
    if (arg === '--no-pages') out.pages = false
    else if (arg === '--dry-run' || arg === '-n') out.dryRun = true
  }
  return out
}

/**
 * Dynasty trade assets that still have no value on (or just before) their
 * trade date — the honest answer to "which trades can't we price?".
 */
function unpriceable(db: DB): Array<{
  tradeId: string
  date: string
  player: string
  reason: string
}> {
  const rows = db
    .prepare(
      `SELECT t.id AS tradeId, t.created_ms AS createdMs,
              COALESCE(p.full_name, ta.player_id) AS player,
              ka.ktc_id AS ktcId
       FROM trade t
       JOIN league_family f ON f.id = t.family_id
       JOIN trade_asset ta ON ta.trade_id = t.id
       LEFT JOIN player p ON p.player_id = ta.player_id
       LEFT JOIN ktc_asset ka ON ka.player_id = ta.player_id
       WHERE f.league_type = 'dynasty'
         AND ta.asset_type = 'player'
         AND t.created_ms IS NOT NULL`,
    )
    .all() as Array<{
    tradeId: string
    createdMs: number
    player: string
    ktcId: number | null
  }>

  const hasValue = db.prepare(
    `SELECT 1 FROM ktc_value WHERE ktc_id = ? AND date BETWEEN ? AND ? LIMIT 1`,
  )

  const out: Array<{ tradeId: string; date: string; player: string; reason: string }> = []
  for (const r of rows) {
    const date = nyDateString(r.createdMs)
    if (r.ktcId == null) {
      out.push({ tradeId: r.tradeId, date, player: r.player, reason: 'not in KTC’s rankings' })
      continue
    }
    const hit = hasValue.get(r.ktcId, shiftDate(date, -KTC_LOOKBACK_DAYS), date)
    if (!hit) {
      out.push({ tradeId: r.tradeId, date, player: r.player, reason: 'no value stored for that date' })
    }
  }
  return out
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const db = getDb()
  try {
    const before = coverage(db)
    console.log(
      `Stored before: ${before.rows} values over ${before.days} day(s)` +
        (before.earliest ? ` (${before.earliest} → ${before.latest})` : ''),
    )

    if (args.dryRun) {
      const missing = assetsNeedingHistory(db)
      console.log(`\nDry run — nothing written.`)
      console.log(`Assets in a trade that need older history: ${missing.length}`)
      for (const m of missing) console.log(`  ${m.name} — needs back to ${m.neededFrom}`)
      report(db)
      return
    }

    console.log('\n1/3 rankings page…')
    const cat = await refreshCatalogue(db)
    console.log(
      `  ${cat.assets} assets, ${cat.matched} matched to Sleeper, ` +
        `${cat.snapshotRows} values stored for today`,
    )
    if (cat.unmatched.length > 0) {
      console.log(`  ${cat.unmatched.length} KTC entries with no Sleeper player:`)
      for (const u of cat.unmatched) console.log(`    ${u}`)
    }
    if (cat.ambiguous.length > 0) {
      console.log(`  ${cat.ambiguous.length} ambiguous — left unmatched, add a ktc_match_override:`)
      for (const a of cat.ambiguous) console.log(`    ${a}`)
    }

    console.log('\n2/3 history feed (180 days, one request)…')
    const rows = await ingestHistories(db, cat.historiesVersion)
    console.log(`  ${rows} daily values stored`)

    const missing = assetsNeedingHistory(db)
    if (!args.pages) {
      console.log(`\n3/3 skipped (--no-pages); ${missing.length} asset(s) would be fetched.`)
    } else if (missing.length === 0) {
      console.log('\n3/3 no player pages needed — every traded asset is covered.')
    } else {
      console.log(`\n3/3 all-time pages for ${missing.length} asset(s) in older trades…`)
      const top = await topUpFromPlayerPages(db, missing, (m, i) =>
        console.log(`  [${i + 1}/${missing.length}] ${m.name} (back to ${m.neededFrom})`),
      )
      console.log(`  ${top.succeeded}/${top.attempted} fetched, ${top.rows} values stored`)
      for (const f of top.failures) console.log(`  failed: ${f}`)
    }

    report(db)
  } catch (err) {
    console.error(`\nBackfill failed: ${errMessage(err)}`)
    console.error('Stored values are unchanged up to the last completed stage.')
    process.exitCode = 1
  } finally {
    closeDb()
  }
}

function report(db: DB): void {
  const after = coverage(db)
  console.log(
    `\nStored now: ${after.rows} values over ${after.days} day(s)` +
      (after.earliest ? ` (${after.earliest} → ${after.latest})` : ''),
  )

  const gaps = unpriceable(db)
  if (gaps.length === 0) {
    console.log('Every dynasty trade asset has a value on (or within 3 days before) its trade date.')
    return
  }
  console.log(`\n${gaps.length} trade asset(s) cannot be priced at the trade date:`)
  for (const g of gaps) {
    console.log(`  ${g.date}  trade ${g.tradeId}  ${g.player} — ${g.reason}`)
  }
  console.log('These render as “value at trade unavailable”; their side totals still sum the rest.')
}

void main()
