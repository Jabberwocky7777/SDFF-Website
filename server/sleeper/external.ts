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
import { cacheDir } from '../db/index.js'

const KTC_PAGE_URL = 'https://keeptradecut.com/dynasty-rankings'

/** KTC embeds player data in the page HTML as `var playersArray = [...]`. */
export async function fetchKtcHtmlRankings(): Promise<unknown> {
  const res = await fetch(KTC_PAGE_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
  })
  if (!res.ok) throw new Error(`KTC returned ${res.status}`)
  const html = await res.text()
  const idx = html.indexOf('var playersArray = [')
  if (idx === -1) throw new Error('KTC: playersArray not found in page')
  const end = html.indexOf('];', idx)
  if (end === -1) throw new Error('KTC: playersArray end not found')
  const raw = JSON.parse(
    html.slice(idx + 'var playersArray = '.length, end + 1),
  ) as Array<{
    playerName: string
    position: string
    team: string
    superflexValues?: { tep?: { rank?: number; value?: number } }
  }>
  return raw
    .filter((p) => ['QB', 'RB', 'WR', 'TE'].includes(p.position))
    .map((p) => ({
      playerName: p.playerName,
      position: p.position,
      team: p.team,
      overallRank: p.superflexValues?.tep?.rank ?? null,
      value: p.superflexValues?.tep?.value ?? null,
    }))
    .filter((p) => p.overallRank != null)
}

const FLOCK_FILE = () => path.join(cacheDir(), 'flock-rankings.csv')
const FLOCK_DEFAULT = path.join(process.cwd(), 'server', 'data', 'flock-rankings-default.csv')

/** User-uploaded CSV if present, otherwise the bundled default. */
export function readFlockCsv(): string {
  try {
    return fs.readFileSync(FLOCK_FILE(), 'utf8')
  } catch {
    return fs.readFileSync(FLOCK_DEFAULT, 'utf8')
  }
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
  fs.mkdirSync(cacheDir(), { recursive: true })
  const ff = FLOCK_FILE()
  const tmp = ff + '.tmp'
  fs.writeFileSync(tmp, body, 'utf8')
  fs.renameSync(tmp, ff)
  return dataRows.length
}
