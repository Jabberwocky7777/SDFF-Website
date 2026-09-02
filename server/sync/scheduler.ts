/**
 * In-process sync scheduler (PLAN.md §5 Phase 2).
 *
 * Incremental sync runs hourly, plus every 15 min on game days (Thu/Sun/Mon).
 * A full backfill is never scheduled — run `npm run sync:backfill` by hand or
 * from the admin page.
 *
 * Disabled automatically in dev unless SYNC_IN_DEV=1. Set SYNC_ENABLED=0 to
 * turn it off in production.
 */
import cron from 'node-cron'
import { getDb } from '../db/index.js'
import { getSleeperClient } from '../sleeper/client.js'
import { getLeagues } from '../config/leagues.js'
import { ingestAll } from './ingest.js'
import { resolveNflState } from './nflState.js'
import { acquireSyncLock, releaseSyncLock, syncLockHolder } from './lock.js'
import { kickBackfillQueue } from './trigger.js'

let lastRun = 0
let lastError: string | null = null

export function schedulerStatus(): { running: boolean; lastRun: number; lastError: string | null } {
  return { running: syncLockHolder() !== null, lastRun, lastError }
}

async function runIncremental(trigger: string): Promise<void> {
  if (!acquireSyncLock(`incremental:${trigger}`)) {
    console.log(`[scheduler] skip (${trigger}) — ${syncLockHolder()} is already running`)
    return
  }
  const started = Date.now()
  try {
    const db = getDb()
    const client = getSleeperClient()
    const state = await resolveNflState(client)
    await ingestAll(client, db, getLeagues(), {
      mode: 'incremental',
      currentNflWeek: state.week,
      currentNflSeason: state.season,
      log: (m) => console.log(`[sync] ${m}`),
    })
    lastRun = Date.now()
    lastError = null
    console.log(`[scheduler] incremental (${trigger}) done in ${((Date.now() - started) / 1000).toFixed(1)}s`)
  } catch (err) {
    lastError = (err as Error).message
    console.error(`[scheduler] incremental (${trigger}) failed:`, err)
  } finally {
    releaseSyncLock()
    kickBackfillQueue() // run any backfills that were queued while we held the lock
  }
}

/** Exposed for the admin "re-sync now" button. */
export function triggerIncremental(): void {
  void runIncremental('manual')
}

export function startScheduler(): void {
  const isDev = process.env.NODE_ENV !== 'production'
  if (process.env.SYNC_ENABLED === '0') {
    console.log('[scheduler] disabled (SYNC_ENABLED=0)')
    return
  }
  if (isDev && process.env.SYNC_IN_DEV !== '1') {
    console.log('[scheduler] disabled in dev (set SYNC_IN_DEV=1 to enable)')
    return
  }

  const tz = process.env.TZ || 'America/New_York'

  // Hourly at :07.
  cron.schedule('7 * * * *', () => void runIncremental('hourly'), { timezone: tz })

  // Every 15 min on Thu(4), Sun(0), Mon(1) — game days.
  cron.schedule('*/15 * * * 0,1,4', () => void runIncremental('gameday'), { timezone: tz })

  // Warm start shortly after boot.
  setTimeout(() => void runIncremental('startup'), 20_000)

  console.log(`[scheduler] started (tz=${tz})`)
}
