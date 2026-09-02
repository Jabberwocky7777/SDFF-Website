/**
 * Backfill leagues on demand (admin "Add league" / "Re-sync now"), one at a
 * time. Requests that arrive while a sync is running are queued and drained in
 * order.
 */
import { getDb } from '../db/index.js'
import { getLeague, getLeagues } from '../config/leagues.js'
import { getSleeperClient } from '../sleeper/client.js'
import { ingestFamily, refreshPlayers } from './ingest.js'
import { resolveNflState } from './nflState.js'
import { acquireSyncLock, releaseSyncLock } from './lock.js'

interface QueueItem {
  slug: string
  force: boolean
}
const queue: QueueItem[] = []
const queued = new Set<string>()
let processing: string | null = null

/** Enqueue a background backfill for one league. Returns 'started' | 'queued'. */
export function backfillLeague(slug: string, opts: { force?: boolean } = {}): 'started' | 'queued' {
  if (!getLeague(slug)) throw new Error(`Unknown league "${slug}"`)
  if (slug !== processing && !queued.has(slug)) {
    queue.push({ slug, force: !!opts.force })
    queued.add(slug)
  }
  const started = drain()
  return started || processing === slug ? 'started' : 'queued'
}

/** Nudge the queue after another sync task releases the lock. */
export function kickBackfillQueue(): void {
  drain()
}

function drain(): boolean {
  if (queue.length === 0 || processing) return false
  if (!acquireSyncLock('backfill-queue')) return false

  const item = queue.shift()!
  queued.delete(item.slug)
  processing = item.slug

  void (async () => {
    const db = getDb()
    const client = getSleeperClient()
    try {
      const league = getLeague(item.slug)
      if (league) {
        const state = await resolveNflState(client)
        await refreshPlayers(client, db, { log: (m) => console.log(`[backfill:${item.slug}] ${m}`) })
        await ingestFamily(client, db, league, {
          mode: 'backfill',
          force: item.force,
          currentNflWeek: state.week,
          currentNflSeason: state.season,
          log: (m) => console.log(`[backfill:${item.slug}] ${m}`),
        })
        console.log(`[backfill:${item.slug}] done`)
      }
    } catch (err) {
      console.error(`[backfill:${item.slug}] failed:`, err)
    } finally {
      processing = null
      releaseSyncLock()
      drain()
    }
  })()

  return true
}

export interface LeagueSyncStatus {
  slug: string
  syncing: boolean
  queued: boolean
  seasons: number
  matchups: number
  lastSync: { at: number | null; status: string | null; error: string | null }
}

export function leagueSyncStatus(slug: string): LeagueSyncStatus {
  const db = getDb()
  const league = getLeague(slug)
  const count = (sql: string) => (league ? (db.prepare(sql).get(league.id) as { c: number }).c : 0)

  const last = db
    .prepare(
      `SELECT finished_at, status, error FROM sync_log WHERE scope LIKE ? ORDER BY id DESC LIMIT 1`,
    )
    .get(`%:${slug}`) as
    | { finished_at: number | null; status: string | null; error: string | null }
    | undefined

  return {
    slug,
    syncing: processing === slug,
    queued: queued.has(slug),
    seasons: count(`SELECT count(*) c FROM league_season WHERE family_id = ?`),
    matchups: count(
      `SELECT count(*) c FROM matchup m JOIN league_season ls ON ls.league_id = m.league_id WHERE ls.family_id = ?`,
    ),
    lastSync: {
      at: last?.finished_at ?? null,
      status: last?.status ?? null,
      error: last?.error ?? null,
    },
  }
}

export function allLeagueSyncStatus(): LeagueSyncStatus[] {
  return getLeagues().map((l) => leagueSyncStatus(l.slug))
}
