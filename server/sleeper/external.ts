/**
 * External (non-Sleeper) data sources used by the dynasty draft tools:
 * KeepTradeCut's HTML-embedded rankings and the Flock rookie-rankings CSV.
 *
 * These aren't league-scoped — they're global dynasty references — but the
 * routes that expose them live under `/api/leagues/:slug/live/*` so access is
 * gated by any valid league code.
 */
import fs from 'node:fs'
import path from 'node:path'
import { readCacheFile, writeCacheFile } from '../lib/jsonFile.js'
import { fetchRankings } from '../ktc/client.js'

/**
 * The draft board's KTC feed: superflex TEP values for QB/RB/WR/TE.
 *
 * The scrape itself lives in `server/ktc/client.ts` now — this is the shape the
 * draft tool has always consumed. TEP is deliberate here (it matches the
 * league's scoring); the trade tracker uses plain superflex instead, because
 * KTC publishes no TEP *history* to pair a TEP "now" with.
 */
export async function fetchKtcHtmlRankings(): Promise<unknown> {
  const { assets } = await fetchRankings()
  return assets
    .filter((p) => ['QB', 'RB', 'WR', 'TE'].includes(p.position))
    .map((p) => ({
      playerName: p.playerName,
      position: p.position,
      team: p.team ?? null,
      overallRank: p.superflexValues.tep?.rank ?? null,
      value: p.superflexValues.tep?.value ?? null,
    }))
    .filter((p) => p.overallRank != null)
}

const FLOCK_FILE = 'flock-rankings.csv'
const FLOCK_DEFAULT = path.join(process.cwd(), 'server', 'data', 'flock-rankings-default.csv')

/** User-uploaded CSV if present, otherwise the bundled default. */
export function readFlockCsv(): string {
  return readCacheFile(FLOCK_FILE) ?? fs.readFileSync(FLOCK_DEFAULT, 'utf8')
}

/** Validate + atomically persist an uploaded Flock CSV. Returns the row count. */
export function writeFlockCsv(body: string): number {
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) {
    throw new Error('CSV must have a header row and at least one data row.')
  }
  const header = lines[0].split(',').map((c) => c.trim().toLowerCase())
  if (!header.includes('name')) {
    throw new Error('CSV header must contain a "Name" column.')
  }
  if (!header.includes('expert rank')) {
    throw new Error('CSV header must contain an "Expert Rank" column.')
  }
  const dataRows = lines.slice(1)
  if (dataRows.length < 10) {
    throw new Error(`CSV must contain at least 10 data rows (found ${dataRows.length}).`)
  }
  writeCacheFile(FLOCK_FILE, body)
  return dataRows.length
}
