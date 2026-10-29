/**
 * KTC value-at-trade lookups and trade-balance maths.
 *
 * The lookups are a loader over `ktc_asset` / `ktc_value` (same shape as
 * `trades.ts`'s own `buildContext`); everything that decides a number is a pure
 * function over that context, so the whole thing is unit-testable with fixture
 * rows and no network.
 *
 * Two rules the rest of the code leans on:
 *
 *  - **Never substitute today's value for the trade-date value.** If no stored
 *    value sits on the trade's date, we walk back at most `KTC_LOOKBACK_DAYS`
 *    (KTC skips the occasional day) and report which date was actually used.
 *    Past that, the answer is `null` and the UI says so.
 *  - **Values are plain superflex, not TE-premium.** See server/ktc/client.ts
 *    for why; the UI says so too.
 *
 * KTC's own trade calculator applies a "value adjustment" that discounts the
 * many-asset side of a lopsided-count trade (two 5,000s are not one 10,000).
 * These are deliberately plain sums — the adjustment is undocumented and
 * guessing at it would make the figures harder to check, not easier.
 */
import type { DB } from '../db/index.js'
import { shiftDate } from '../lib/nyDate.js'

/** How many days back a lookup may slide when the exact date has no row. */
export const KTC_LOOKBACK_DAYS = 3

/** Percentage-gap boundaries for the balance label. */
export const KTC_BALANCE_THRESHOLDS = { slight: 5, clear: 15, lopsided: 30 } as const

export type KtcBalanceLabel = 'even' | 'slight' | 'clear' | 'lopsided'

export interface KtcAssetValue {
  atTrade: number | null
  /** The date the at-trade value was actually read from. */
  atTradeDate: string | null
  now: number | null
  nowDate: string | null
  change: number | null
  /** Percent, one decimal. Null when there is no at-trade value to compare to. */
  changePct: number | null
}

export interface KtcSideTotal {
  userId: string
  atTrade: number | null
  now: number | null
  /** Assets on this side that carry a KTC value at all. */
  valued: number
  /** Assets with no at-trade value (unranked player, or history too short). */
  missingAtTrade: number
}

export interface KtcBalance {
  sides: KtcSideTotal[]
  gapAtTrade: number | null
  gapPctAtTrade: number | null
  label: KtcBalanceLabel | null
  gapNow: number | null
  gapPctNow: number | null
  labelNow: KtcBalanceLabel | null
  /** User id of the side that got the most value at the time, if known. */
  favoredUserId: string | null
  /** True when at least one asset in the trade has no at-trade value. */
  incomplete: boolean
}

// ── context ──────────────────────────────────────────────────────────────────

export interface KtcPointRef {
  date: string
  value: number
}

export interface KtcCtx {
  /** Sleeper player_id → KTC id. */
  byPlayerId: Map<string, number>
  /** `season:round:tier` → KTC id, for rookie-pick assets. */
  byPick: Map<string, number>
  /** KTC id → its newest stored value. */
  latest: Map<number, KtcPointRef>
  /** `ktcId:date` → value, for the dates the caller asked about. */
  atDate: Map<string, number>
  /** Oldest / newest dates we hold anything for, for honest messaging. */
  earliestStored: string | null
  latestStored: string | null
}

export function pickKey(season: number, round: number, tier: string): string {
  return `${season}:${round}:${tier}`
}

/**
 * Load everything the per-trade maths needs. `tradeDates` are 'YYYY-MM-DD'
 * strings; only those dates (and the few days before each) are pulled in, so a
 * feed of a dozen trades reads a few hundred rows rather than the whole table.
 */
export function loadKtcContext(db: DB, tradeDates: readonly string[]): KtcCtx {
  const byPlayerId = new Map<string, number>()
  const byPick = new Map<string, number>()
  for (const row of db
    .prepare(
      `SELECT ktc_id, player_id, pick_season, pick_round, pick_tier FROM ktc_asset`,
    )
    .all() as Array<{
    ktc_id: number
    player_id: string | null
    pick_season: number | null
    pick_round: number | null
    pick_tier: string | null
  }>) {
    if (row.player_id) byPlayerId.set(row.player_id, row.ktc_id)
    if (row.pick_season != null && row.pick_round != null && row.pick_tier) {
      byPick.set(pickKey(row.pick_season, row.pick_round, row.pick_tier), row.ktc_id)
    }
  }

  const latest = new Map<number, KtcPointRef>()
  for (const row of db
    .prepare(
      `SELECT v.ktc_id, v.date, v.value
       FROM ktc_value v
       JOIN (SELECT ktc_id, MAX(date) AS d FROM ktc_value GROUP BY ktc_id) m
         ON m.ktc_id = v.ktc_id AND m.d = v.date`,
    )
    .all() as Array<{ ktc_id: number; date: string; value: number }>) {
    latest.set(row.ktc_id, { date: row.date, value: row.value })
  }

  const wanted = new Set<string>()
  for (const d of tradeDates) {
    for (let back = 0; back <= KTC_LOOKBACK_DAYS; back++) wanted.add(shiftDate(d, -back))
  }
  const atDate = new Map<string, number>()
  if (wanted.size > 0) {
    const list = [...wanted]
    const placeholders = list.map(() => '?').join(',')
    for (const row of db
      .prepare(`SELECT ktc_id, date, value FROM ktc_value WHERE date IN (${placeholders})`)
      .all(...list) as Array<{ ktc_id: number; date: string; value: number }>) {
      atDate.set(`${row.ktc_id}:${row.date}`, row.value)
    }
  }

  const bounds = db
    .prepare(`SELECT MIN(date) AS lo, MAX(date) AS hi FROM ktc_value`)
    .get() as { lo: string | null; hi: string | null }

  return {
    byPlayerId,
    byPick,
    latest,
    atDate,
    earliestStored: bounds.lo,
    latestStored: bounds.hi,
  }
}

// ── pure lookups ─────────────────────────────────────────────────────────────

/** The stored value on `date`, else the nearest earlier one within the window. */
export function valueOn(ctx: KtcCtx, ktcId: number, date: string): KtcPointRef | null {
  for (let back = 0; back <= KTC_LOOKBACK_DAYS; back++) {
    const on = shiftDate(date, -back)
    const value = ctx.atDate.get(`${ktcId}:${on}`)
    if (value != null) return { date: on, value }
  }
  return null
}

export function latestValue(ctx: KtcCtx, ktcId: number): KtcPointRef | null {
  return ctx.latest.get(ktcId) ?? null
}

/**
 * One asset's then/now pair. `thenKtcId` and `nowKtcId` differ for a pick: the
 * pick itself was traded, but what it is worth today is the player drafted with
 * it. Returns null only when neither end is a KTC asset at all (FAAB).
 */
export function assetValue(
  ctx: KtcCtx,
  thenKtcId: number | null,
  nowKtcId: number | null,
  tradeDate: string,
): KtcAssetValue | null {
  if (thenKtcId == null && nowKtcId == null) return null

  const then = thenKtcId == null ? null : valueOn(ctx, thenKtcId, tradeDate)
  const now = nowKtcId == null ? null : latestValue(ctx, nowKtcId)

  const change = then && now ? now.value - then.value : null
  const changePct =
    then && now && then.value !== 0
      ? Math.round(((now.value - then.value) / then.value) * 1000) / 10
      : null

  return {
    atTrade: then?.value ?? null,
    atTradeDate: then?.date ?? null,
    now: now?.value ?? null,
    nowDate: now?.date ?? null,
    change,
    changePct,
  }
}

function sumOrNull(values: readonly (number | null)[]): number | null {
  const present = values.filter((v): v is number => v != null)
  return present.length === 0 ? null : present.reduce((a, b) => a + b, 0)
}

export function balanceLabel(gapPct: number | null): KtcBalanceLabel | null {
  if (gapPct == null) return null
  if (gapPct < KTC_BALANCE_THRESHOLDS.slight) return 'even'
  if (gapPct < KTC_BALANCE_THRESHOLDS.clear) return 'slight'
  if (gapPct < KTC_BALANCE_THRESHOLDS.lopsided) return 'clear'
  return 'lopsided'
}

/**
 * Per-side totals plus how lopsided the trade was. Works for any number of
 * sides: the gap is the spread between the best- and worst-off side, which for
 * the two-team case is the plain difference.
 */
export function ktcBalance(
  sides: readonly { userId: string; assets: readonly (KtcAssetValue | null)[] }[],
): KtcBalance {
  const totals: KtcSideTotal[] = sides.map((s) => {
    const valued = s.assets.filter((a): a is KtcAssetValue => a != null)
    return {
      userId: s.userId,
      atTrade: sumOrNull(valued.map((a) => a.atTrade)),
      now: sumOrNull(valued.map((a) => a.now)),
      valued: valued.length,
      missingAtTrade: valued.filter((a) => a.atTrade == null).length,
    }
  })

  const spread = (pick: (t: KtcSideTotal) => number | null) => {
    const present = totals.map(pick).filter((v): v is number => v != null)
    if (present.length < 2) return { gap: null, pct: null }
    const hi = Math.max(...present)
    const lo = Math.min(...present)
    const gap = Math.round((hi - lo) * 10) / 10
    return { gap, pct: hi === 0 ? null : Math.round((gap / hi) * 1000) / 10 }
  }

  const then = spread((t) => t.atTrade)
  const now = spread((t) => t.now)

  const best = totals.reduce<KtcSideTotal | null>(
    (acc, t) => (t.atTrade != null && (acc?.atTrade == null || t.atTrade > acc.atTrade) ? t : acc),
    null,
  )

  return {
    sides: totals,
    gapAtTrade: then.gap,
    gapPctAtTrade: then.pct,
    label: balanceLabel(then.pct),
    gapNow: now.gap,
    gapPctNow: now.pct,
    labelNow: balanceLabel(now.pct),
    favoredUserId: then.gap != null && then.gap > 0 ? best?.userId ?? null : null,
    // Either an asset we could not price, or a whole side with nothing
    // priceable on it. Both mean the split below is not the full story.
    incomplete: totals.some((t) => t.missingAtTrade > 0 || t.atTrade == null),
  }
}
