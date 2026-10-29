/**
 * Zod schemas for everything we read out of keeptradecut.com.
 *
 * KTC has no public API — all three shapes below are scraped out of page HTML,
 * so they can change without notice. Same philosophy as the Sleeper schemas:
 * validate only the fields we read, stay `.loose()` so an added field never
 * breaks us, and fail loudly enough that the caller can keep serving the last
 * stored values instead of writing nonsense.
 */
import { z } from 'zod'

/** A date/value pair, already decoded out of whatever KTC encoded it as. */
export interface KtcPoint {
  /** 'YYYY-MM-DD' */
  date: string
  value: number
}

// ── the rankings page: <script type="application/json" id="ktc-players"> ─────

const valueBlockSchema = z
  .object({
    value: z.number().nullable().optional(),
    rank: z.number().nullable().optional(),
  })
  .loose()

/**
 * `superflexValues` carries the plain figures at the top level and the
 * tight-end-premium variants under `tep`. The trade tracker reads the plain
 * ones; the draft board reads TEP.
 */
const superflexValuesSchema = z
  .object({
    value: z.number().nullable().optional(),
    rank: z.number().nullable().optional(),
    tep: valueBlockSchema.optional(),
  })
  .loose()

export const ktcRankingsAssetSchema = z
  .object({
    playerName: z.string(),
    playerID: z.number(),
    slug: z.string(),
    position: z.string(),
    team: z.string().nullable().optional(),
    superflexValues: superflexValuesSchema,
  })
  .loose()

export const ktcRankingsSchema = z.array(ktcRankingsAssetSchema)
export type KtcRankingsAsset = z.infer<typeof ktcRankingsAssetSchema>

// ── the bulk histories feed: /dynasty-rankings/histories ─────────────────────

/**
 * KTC compresses a history point into one string: six digits of date
 * (`YYMMDD`) followed by the value. `"2608227620"` is 2026-08-22 at 7620.
 * Their own `parseDateFromCompressedDate` does `"20" + s.slice(0,2)` etc., so
 * the century is hardcoded on their side too.
 */
const compressedPointSchema = z.string().regex(/^\d{7,}$/)

export const ktcHistoryEntrySchema = z
  .object({
    playerID: z.number(),
    superflex: z
      .object({
        valueHistory: z.array(compressedPointSchema),
      })
      .loose(),
  })
  .loose()

export const ktcHistoriesSchema = z.array(ktcHistoryEntrySchema)

export function decodeCompressedPoint(raw: string): KtcPoint {
  const date = `20${raw.slice(0, 2)}-${raw.slice(2, 4)}-${raw.slice(4, 6)}`
  return { date, value: Number(raw.slice(6)) }
}

// ── a player page: <script type="application/json" id="pd-superflex"> ────────

/**
 * The all-time series behind the value-over-time chart. Uncompressed here,
 * `{d: "230310", v: 5232}`, and superflex-only — the page's `tep` object
 * carries adjacent players but no history at all.
 */
export const ktcPlayerPageSchema = z
  .object({
    overallValue: z.array(
      z
        .object({ d: z.string().regex(/^\d{6}$/), v: z.number() })
        .loose(),
    ),
  })
  .loose()

export function decodePlayerPagePoint(p: { d: string; v: number }): KtcPoint {
  return { date: `20${p.d.slice(0, 2)}-${p.d.slice(2, 4)}-${p.d.slice(4, 6)}`, value: p.v }
}
