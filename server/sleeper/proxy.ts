/**
 * Thin TTL cache wrapper around live Sleeper calls, shared by the legacy
 * single-league proxy and the new per-league routes. Volatile data (current
 * rosters, live matchups) stays on the file cache — only historical/computed
 * data goes to SQLite (PLAN.md §0).
 */
import type { Response } from 'express'
import { readCache, writeCache, readStale } from '../cache.js'
import { getSleeperClient } from './client.js'

const SLEEPER_BASE = 'https://api.sleeper.app/v1'

const GAME_DAYS = new Set([0, 1, 4]) // Sun, Mon, Thu
export function isGameDay(): boolean {
  return GAME_DAYS.has(new Date().getDay())
}

/**
 * Serve `path` (a Sleeper API path like `/league/123/rosters`) with a file
 * cache in front and a stale fallback if Sleeper is down.
 */
export async function serveCached(
  res: Response,
  cacheKey: string,
  sleeperPath: string,
  ttlSeconds: number,
): Promise<void> {
  const hit = readCache(cacheKey, ttlSeconds)
  if (hit != null) {
    res.json(hit)
    return
  }
  try {
    const data = await getSleeperClient().raw(`${SLEEPER_BASE}${sleeperPath}`)
    writeCache(cacheKey, data)
    res.json(data ?? null)
  } catch (err) {
    const stale = readStale(cacheKey)
    if (stale != null) {
      res.setHeader('X-Cache-Stale', 'true')
      res.json(stale)
    } else {
      console.error('[sleeper proxy]', err)
      res.status(502).json({ error: 'Sleeper API unavailable and no cache found.' })
    }
  }
}
