/**
 * Zero-touch first-run backfill.
 *
 * On startup, any configured league that has never been ingested (no
 * `league_family` row) gets a full historical backfill in the background. This
 * makes a fresh deploy self-populating — no `docker compose exec` needed.
 *
 * Runs once the HTTP server is already listening so the health check passes
 * immediately. Set AUTO_BACKFILL=0 to disable.
 */
import type { DB } from '../db/index.js'
import { getLeagues } from '../config/leagues.js'
import { getSleeperClient } from '../sleeper/client.js'
import { ingestFamily, refreshPlayers } from './ingest.js'
import { resolveNflState } from './nflState.js'
import { acquireSyncLock, releaseSyncLock } from './lock.js'

export function autoBackfillIfNeeded(db: DB): void {
  if (process.env.AUTO_BACKFILL === '0') return

  const missing = getLeagues().filter((l) => {
    const row = db.prepare(`SELECT 1 FROM league_family WHERE slug = ?`).get(l.slug)
    return !row
  })
  if (missing.length === 0) return

  if (!acquireSyncLock('autobackfill')) return

  // Detach: don't block startup, don't crash the process on failure.
  void (async () => {
    const client = getSleeperClient()
    try {
      console.log(
        `[autobackfill] ${missing.length} league(s) never ingested — starting background backfill: ` +
          missing.map((l) => l.slug).join(', '),
      )
      const state = await resolveNflState(client)
      await refreshPlayers(client, db, { log: (m) => console.log(`[autobackfill] ${m}`) })
      for (const entry of missing) {
        await ingestFamily(client, db, entry, {
          mode: 'backfill',
          currentNflWeek: state.week,
          currentNflSeason: state.season,
          log: (m) => console.log(`[autobackfill] ${m}`),
        })
      }
      console.log(
        `[autobackfill] done (${client.stats.requestCount} Sleeper requests).`,
      )
    } catch (err) {
      console.error('[autobackfill] failed — run sync:backfill manually:', err)
    } finally {
      releaseSyncLock()
    }
  })()
}
