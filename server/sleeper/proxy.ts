/**
 * Thin TTL cache wrapper around live Sleeper calls, shared by the legacy
 * single-league proxy and the new per-league routes. Volatile data (current
 * rosters, live matchups) stays on the file cache — only historical/computed
 * data goes to SQLite.
 */
import type { Response } from 'express'
import { readCache, writeCache, readStale } from '../cache.js'
import { getSleeperClient } from './client.js'
import { log } from '../log.js'

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
      log.error('sleeper proxy failed with no cache to fall back on', { err: (err as Error).message })
      res.status(502).json({ error: 'Sleeper API unavailable and no cache found.' })
    }
  }
}

/**
 * Serve an arbitrary external (non-Sleeper) URL with the same file-cache +
 * stale-fallback behaviour. Used for the dynasty ranking sources (FantasyCalc,
 * KeepTradeCut) which aren't league-scoped but are gated behind league access.
 */
export async function serveCachedUrl(
  res: Response,
  cacheKey: string,
  url: string,
  ttlSeconds: number,
  opts: { headers?: Record<string, string>; emptyOnError?: boolean } = {},
): Promise<void> {
  const hit = readCache(cacheKey, ttlSeconds)
  if (hit != null) {
    res.json(hit)
    return
  }
  try {
    const r = await fetch(url, {
      headers: opts.headers ?? { 'User-Agent': 'SDFF-Website/1.0' },
    })
    if (!r.ok) throw new Error(`${url} returned ${r.status}`)
    const data = await r.json()
    writeCache(cacheKey, data)
    res.json(data)
  } catch (err) {
    const stale = readStale(cacheKey)
    if (stale != null) {
      res.setHeader('X-Cache-Stale', 'true')
      res.json(stale)
    } else if (opts.emptyOnError) {
      res.json([])
    } else {
      log.error('external proxy failed with no cache to fall back on', { err: (err as Error).message })
      res.status(502).json({ error: 'Upstream API unavailable and no cache found.' })
    }
  }
}
