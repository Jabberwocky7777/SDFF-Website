/**
 * TTL cache for live upstream responses (Sleeper, FantasyCalc, KTC).
 *
 * Entries are wrapped in an envelope carrying the fetch time so a stale copy
 * can still be served when the upstream is down — see sleeper/proxy.ts.
 * Storage mechanics live in lib/jsonFile.ts, which also rejects keys that
 * could escape the cache directory.
 */
import { readJsonFile, writeCacheFile } from './lib/jsonFile.js'
import { log } from './log.js'

interface CacheEnvelope {
  data: unknown
  cachedAt: number
}

const EMPTY: CacheEnvelope = { data: null, cachedAt: 0 }

const fileFor = (key: string) => `${key}.json`

/** Cached value, or null if absent or older than ttlSeconds. */
export function readCache(key: string, ttlSeconds: number): unknown | null {
  const envelope = readJsonFile<CacheEnvelope>(fileFor(key), EMPTY)
  if (!envelope.cachedAt) return null
  if (Date.now() - envelope.cachedAt > ttlSeconds * 1000) return null
  return envelope.data
}

export function writeCache(key: string, data: unknown): void {
  const envelope: CacheEnvelope = { data, cachedAt: Date.now() }
  try {
    writeCacheFile(fileFor(key), JSON.stringify(envelope))
  } catch (err) {
    // A failed cache write costs a round trip, not correctness.
    log.error('cache write failed', { key, err: (err as Error).message })
  }
}

/** Cached value regardless of age — the fallback when an upstream fetch fails. */
export function readStale(key: string): unknown | null {
  const envelope = readJsonFile<CacheEnvelope>(fileFor(key), EMPTY)
  return envelope.cachedAt ? envelope.data : null
}
