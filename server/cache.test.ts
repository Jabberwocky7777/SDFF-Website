import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  readCache,
  readCacheSerialized,
  readStale,
  readStaleSerialized,
  writeCache,
} from './cache.js'

/**
 * Cache keys reach fileFor() from route params, so the guard against path
 * separators is a security control, not a tidiness check. These cover both
 * that it holds and that the key shapes the app actually uses still work.
 */

let dir: string
let outside: string

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdff-cache-test-'))
  process.env.CACHE_DIR = dir
  // A file one level above the cache dir — the thing a traversal would target.
  outside = path.join(path.dirname(dir), 'secrets.json')
  fs.writeFileSync(outside, JSON.stringify({ data: { code: 'TOP-SECRET' }, cachedAt: Date.now() }))
})

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(outside, { force: true })
})

describe('cache key validation', () => {
  const traversals = [
    '../secrets',
    '../../etc/passwd',
    '..\\..\\windows',
    'matchups_../../secrets',
    'nested/key',
    'sneaky/../../escape',
  ]

  it.each(traversals)('refuses to read through %j', (key) => {
    // Reads fail closed: a rejected key is indistinguishable from a cache miss.
    expect(readCache(key, 60)).toBeNull()
    expect(readStale(key)).toBeNull()
    expect(readCacheSerialized(key, 60)).toBeNull()
    expect(readStaleSerialized(key)).toBeNull()
  })

  it.each(traversals)('refuses to write through %j', (key) => {
    expect(() => writeCache(key, { pwned: true })).not.toThrow()
  })

  it('does not escape the cache directory', () => {
    const key = `..${path.sep}secrets`
    writeCache(key, { pwned: true })
    // The pre-existing file above the cache dir is untouched.
    const still = JSON.parse(fs.readFileSync(outside, 'utf8')) as { data: { code: string } }
    expect(still.data.code).toBe('TOP-SECRET')
    // And nothing was created outside the cache dir.
    expect(fs.existsSync(path.join(path.dirname(dir), 'secrets.json.tmp'))).toBe(false)
  })

  it('still accepts the key shapes the routes generate', () => {
    const realKeys = [
      'nfl_players',
      'nfl_state',
      'ktc_rankings',
      'ktc-superflex',
      'rankings_fantasycalc',
      'lg_1337165090381639680_league',
      'lg_1337165090381639680_matchups_14',
      'draft_picks_1337165090381639680',
      'stats_2025',
    ]
    for (const key of realKeys) {
      writeCache(key, { ok: key })
      expect(readCache(key, 60)).toEqual({ ok: key })
    }
  })

  it('expires entries past their TTL but still serves them as stale', async () => {
    writeCache('ttl_probe', { v: 1 })
    expect(readCache('ttl_probe', 60)).toEqual({ v: 1 })
    // Sleep so the entry is measurably older than a zero-second TTL; without it
    // the write and read can land in the same millisecond.
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(readCache('ttl_probe', 0)).toBeNull()
    expect(readStale('ttl_probe')).toEqual({ v: 1 })
  })

  it('reports a miss for a key that was never written', () => {
    expect(readCache('never_written', 60)).toBeNull()
    expect(readStale('never_written')).toBeNull()
  })
})

/**
 * The serialized readers exist so the ~15 MB player blob isn't parsed and
 * re-serialized per request. They memoize, so the risk they carry is staleness
 * rather than throughput — these cover the invalidation paths.
 */
describe('serialized cache reads', () => {
  it('returns JSON text matching what readCache returns as an object', () => {
    const value = { players: { '4034': { name: 'A. Player' } }, n: 1 }
    writeCache('ser_basic', value)
    const json = readCacheSerialized('ser_basic', 60)
    expect(json).not.toBeNull()
    expect(JSON.parse(json!)).toEqual(value)
    expect(JSON.parse(json!)).toEqual(readCache('ser_basic', 60))
  })

  it('reports a miss for a key that was never written', () => {
    expect(readCacheSerialized('ser_absent', 60)).toBeNull()
    expect(readStaleSerialized('ser_absent')).toBeNull()
  })

  it('expires past its TTL but still serves stale text', async () => {
    writeCache('ser_ttl', { v: 1 })
    expect(JSON.parse(readCacheSerialized('ser_ttl', 60)!)).toEqual({ v: 1 })
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(readCacheSerialized('ser_ttl', 0)).toBeNull()
    expect(JSON.parse(readStaleSerialized('ser_ttl')!)).toEqual({ v: 1 })
  })

  it('picks up a rewrite in the same millisecond', () => {
    // The memo keys off mtime+size, and mtime can be second-granular. Without
    // the explicit invalidation in writeCache this serves the stale payload.
    writeCache('ser_rewrite', { v: 1 })
    expect(JSON.parse(readCacheSerialized('ser_rewrite', 60)!)).toEqual({ v: 1 })
    writeCache('ser_rewrite', { v: 2 })
    expect(JSON.parse(readCacheSerialized('ser_rewrite', 60)!)).toEqual({ v: 2 })
  })

  it('picks up a same-size rewrite', () => {
    // Same byte length, so only mtime differs — and if the payload changed
    // without the size changing, the memo must still notice.
    writeCache('ser_samesize', { v: 'aaa' })
    expect(JSON.parse(readCacheSerialized('ser_samesize', 60)!)).toEqual({ v: 'aaa' })
    writeCache('ser_samesize', { v: 'bbb' })
    expect(JSON.parse(readCacheSerialized('ser_samesize', 60)!)).toEqual({ v: 'bbb' })
  })

  it('serves a null payload as the text "null" rather than a miss', () => {
    writeCache('ser_null', null)
    expect(readCacheSerialized('ser_null', 60)).toBe('null')
  })
})
