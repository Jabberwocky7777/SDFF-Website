/**
 * Thin TTL cache wrapper around live Sleeper calls, shared by the legacy
 * single-league proxy and the new per-league routes. Volatile data (current
 * rosters, live matchups) stays on the file cache — only historical/computed
 * data goes to SQLite.
 */
import type { Response } from 'express'
import {
  readCache,
  readCacheSerialized,
  readStale,
  readStaleSerialized,
  writeCache,
} from '../cache.js'
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

/** Send pre-serialized JSON text without routing it back through res.json(). */
function sendJson(res: Response, json: string): void {
  res.type('application/json').send(json)
}

/**
 * serveCached for payloads big enough that parsing them per request is a
 * memory hazard — currently just the ~15 MB `/players/nfl` blob. Identical
 * behaviour (TTL, stale fallback, 502), but the body never becomes a JS object
 * graph on the way to the client. Only safe for routes that forward the payload
 * untouched; anything that needs to read or reshape the data wants serveCached.
 */
export async function serveCachedLarge(
  res: Response,
  cacheKey: string,
  sleeperPath: string,
  ttlSeconds: number,
): Promise<void> {
  const hit = readCacheSerialized(cacheKey, ttlSeconds)
  if (hit != null) {
    sendJson(res, hit)
    return
  }
  try {
    const data = await getSleeperClient().raw(`${SLEEPER_BASE}${sleeperPath}`)
    writeCache(cacheKey, data)
    // Serialized once more here rather than re-reading the file we just wrote.
    // This is the cache-miss path — once a day for the player blob.
    sendJson(res, JSON.stringify(data ?? null))
  } catch (err) {
    const stale = readStaleSerialized(cacheKey)
    if (stale != null) {
      res.setHeader('X-Cache-Stale', 'true')
      sendJson(res, stale)
    } else {
      log.error('sleeper proxy failed with no cache to fall back on', {
        key: cacheKey,
        err: (err as Error).message,
      })
      res.status(502).json({ error: 'Sleeper API unavailable and no cache found.' })
    }
  }
}
