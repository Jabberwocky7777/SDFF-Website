/**
 * All KeepTradeCut network access lives here. Nothing else in the server
 * fetches keeptradecut.com, and nothing in the frontend ever does.
 *
 * There is no public KTC API (`api.keeptradecut.com`, which an older route
 * pointed at, does not resolve), so these are three HTML scrapes:
 *
 *  1. `fetchRankings()` — the rankings page. KTC used to inline the data as
 *     `var playersArray = [...]`; it now ships
 *     `<script type="application/json" id="ktc-players">`. Today's values, plus
 *     the `historiesVersion` token the history feed is keyed by.
 *  2. `fetchHistories()` — `/dynasty-rankings/histories`, the feed behind every
 *     player's value-over-time chart. One request returns a rolling **180 days**
 *     of daily values for every ranked asset. This is what makes a backfill
 *     cheap.
 *  3. `fetchPlayerAllTime()` — a single player's page, whose `#pd-superflex`
 *     block holds the full series (back to 2020 for long-tenured players).
 *     3–4 MB each, so it is reserved for assets whose trade predates the
 *     180-day window.
 *
 * **Values are plain superflex, not TE-premium.** KTC publishes TEP history for
 * tight ends only, and the all-time per-player series carries no TEP series at
 * all, so a TEP "then" cannot be paired with a TEP "now" for most assets. For
 * every non-TE the two numbers are identical anyway. The draft tool's own
 * rankings keep using TEP; this module deliberately does not.
 *
 * Politeness: a real browser User-Agent, requests issued sequentially, and a
 * delay between player-page hits.
 */
import { z } from 'zod'
import {
  decodeCompressedPoint,
  decodePlayerPagePoint,
  ktcHistoriesSchema,
  ktcPlayerPageSchema,
  ktcRankingsSchema,
  type KtcPoint,
  type KtcRankingsAsset,
} from './schemas.js'

const ORIGIN = 'https://keeptradecut.com'
const RANKINGS_URL = `${ORIGIN}/dynasty-rankings`

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/** Pause between consecutive player-page requests. */
export const PLAYER_PAGE_DELAY_MS = 1_500

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function getText(url: string, accept: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: accept, Referer: RANKINGS_URL },
  })
  if (!res.ok) throw new Error(`KTC ${url} returned ${res.status}`)
  return res.text()
}

/**
 * Pull the contents of `<script type="application/json" id="…">` out of a page.
 * KTC's JSON blocks are not HTML-escaped beyond what JSON itself requires, so
 * slicing to the closing tag is safe.
 */
function extractJsonScript(html: string, id: string): unknown {
  const open = `<script type="application/json" id="${id}">`
  const start = html.indexOf(open)
  if (start === -1) throw new Error(`KTC: #${id} not found in page`)
  const from = start + open.length
  const end = html.indexOf('</script>', from)
  if (end === -1) throw new Error(`KTC: #${id} is unterminated`)
  return JSON.parse(html.slice(from, end)) as unknown
}

export interface KtcRankingsResult {
  assets: KtcRankingsAsset[]
  /** Token the histories feed is versioned by; null if the page stopped emitting it. */
  historiesVersion: string | null
}

export async function fetchRankings(): Promise<KtcRankingsResult> {
  const html = await getText(RANKINGS_URL, 'text/html,application/xhtml+xml')
  const assets = ktcRankingsSchema.parse(extractJsonScript(html, 'ktc-players'))
  const version = /var historiesVersion = '([^']+)'/.exec(html)?.[1] ?? null
  return { assets, historiesVersion: version }
}

/**
 * The bulk history feed, keyed by KTC id. `version` comes from `fetchRankings()`;
 * `sr` is KTC's own cache schema revision.
 */
export async function fetchHistories(version: string | null): Promise<Map<number, KtcPoint[]>> {
  const url = version
    ? `${ORIGIN}/dynasty-rankings/histories?v=${encodeURIComponent(version)}&sr=2`
    : `${ORIGIN}/dynasty-rankings/histories`
  const raw = await getText(url, 'application/json')
  const parsed = ktcHistoriesSchema.parse(JSON.parse(raw) as unknown)
  const out = new Map<number, KtcPoint[]>()
  for (const entry of parsed) {
    out.set(entry.playerID, entry.superflex.valueHistory.map(decodeCompressedPoint))
  }
  return out
}

/** One asset's full series, oldest first. */
export async function fetchPlayerAllTime(slug: string): Promise<KtcPoint[]> {
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`KTC: unsafe slug ${JSON.stringify(slug)}`)
  const html = await getText(
    `${ORIGIN}/dynasty-rankings/players/${slug}`,
    'text/html,application/xhtml+xml',
  )
  const page = ktcPlayerPageSchema.parse(extractJsonScript(html, 'pd-superflex'))
  return page.overallValue.map(decodePlayerPagePoint)
}

// ── pick assets ──────────────────────────────────────────────────────────────

export interface PickParts {
  season: number
  round: number
  tier: 'early' | 'mid' | 'late'
}

/**
 * KTC lists rookie picks as position `RDP`, named "2027 Early 1st". Only
 * Early / Mid / Late exist — there is no generic entry for a round — and only
 * for rounds 1–4 of drafts that have not happened yet: once a draft is in the
 * books its picks are removed from KTC entirely.
 */
export function parsePickName(name: string): PickParts | null {
  const m = /^(\d{4})\s+(early|mid|late)\s+(\d+)(?:st|nd|rd|th)$/i.exec(name.trim())
  if (!m) return null
  return {
    season: Number(m[1]),
    round: Number(m[3]),
    tier: m[2].toLowerCase() as PickParts['tier'],
  }
}

/** Narrow a thrown error to the message the callers log. */
export function errMessage(err: unknown): string {
  if (err instanceof z.ZodError) return `KTC payload failed validation: ${err.issues[0]?.message}`
  return err instanceof Error ? err.message : String(err)
}
