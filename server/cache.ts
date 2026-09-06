/**
 * TTL cache for live upstream responses (Sleeper, FantasyCalc, KTC).
 *
 * Entries are wrapped in an envelope carrying the fetch time so a stale copy
 * can still be served when the upstream is down — see sleeper/proxy.ts.
 * Storage mechanics live in lib/jsonFile.ts, which also rejects keys that
 * could escape the cache directory.
 */
import fs from 'node:fs'
import { cacheFilePath, readJsonFile, writeCacheFile } from './lib/jsonFile.js'
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
  // Explicit, not just mtime-driven: mtime has one-second granularity on some
  // filesystems, so a rewrite inside the same second could otherwise leave the
  // memo below serving the previous payload.
  serialized.delete(key)
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

// ── Serialized reads, for payloads too big to reparse per request ──────────
//
// The NFL player blob is ~15 MB on disk. Serving it through readCache() +
// res.json() parses it into an 11k-key object graph and re-serializes the whole
// thing on every request — hundreds of MB of transient heap per concurrent
// caller, which is enough to get a memory-limited container OOM-killed with no
// log output at all. Callers that forward the payload verbatim (they never look
// inside it) should use these instead: the JSON text is built once per file
// change and handed to Express as a string it can write straight to the socket.
//
// The cost is one resident copy of the string per memoized key, which is
// bounded and far cheaper than the per-request churn it replaces.

interface SerializedEntry {
  stamp: string
  cachedAt: number
  json: string
}

const serialized = new Map<string, SerializedEntry>()

/** Cheap change-detector: a cache file's mtime and size. Null if unreadable. */
function fileStamp(key: string): string | null {
  try {
    const st = fs.statSync(cacheFilePath(fileFor(key)))
    return `${st.mtimeMs}:${st.size}`
  } catch {
    // Missing file, or a key the traversal guard rejected. Reads fail closed.
    return null
  }
}

/** Load and memoize the serialized payload, or null if absent/unreadable. */
function loadSerialized(key: string): SerializedEntry | null {
  const stamp = fileStamp(key)
  if (stamp === null) {
    serialized.delete(key)
    return null
  }
  const memo = serialized.get(key)
  if (memo && memo.stamp === stamp) return memo

  const envelope = readJsonFile<CacheEnvelope>(fileFor(key), EMPTY)
  if (!envelope.cachedAt) {
    serialized.delete(key)
    return null
  }
  const entry: SerializedEntry = {
    stamp,
    cachedAt: envelope.cachedAt,
    json: JSON.stringify(envelope.data ?? null),
  }
  serialized.set(key, entry)
  return entry
}

/** Like readCache, but returns ready-to-send JSON text. Null on miss/expiry. */
export function readCacheSerialized(key: string, ttlSeconds: number): string | null {
  const entry = loadSerialized(key)
  if (!entry) return null
  if (Date.now() - entry.cachedAt > ttlSeconds * 1000) return null
  return entry.json
}

/** Like readStale, but returns ready-to-send JSON text regardless of age. */
export function readStaleSerialized(key: string): string | null {
  return loadSerialized(key)?.json ?? null
}
