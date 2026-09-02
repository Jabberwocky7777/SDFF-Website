/**
 * Zero-touch first-run backfill.
 *
 * On startup, any league with no ingested seasons yet is queued for a full
 * historical backfill (covers the legacy-config import and any prior run that
 * never finished). Leagues added through the admin UI queue themselves.
 *
 * Runs once the HTTP server is listening so the health check passes. Set
 * AUTO_BACKFILL=0 to disable.
 */
import type { DB } from '../db/index.js'
import { getLeagues } from '../config/leagues.js'
import { backfillLeague } from './trigger.js'

export function autoBackfillIfNeeded(db: DB): void {
  if (process.env.AUTO_BACKFILL === '0') return

  const pending = getLeagues(db).filter((l) => {
    const { c } = db
      .prepare(`SELECT count(*) c FROM league_season WHERE family_id = ?`)
      .get(l.id) as { c: number }
    return c === 0
  })
  if (pending.length === 0) return

  console.log(`[autobackfill] queueing ${pending.length} league(s): ${pending.map((l) => l.slug).join(', ')}`)
  for (const l of pending) backfillLeague(l.slug)
}
