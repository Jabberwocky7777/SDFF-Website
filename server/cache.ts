import fs from 'fs'
import path from 'path'
import { cacheDir } from './db/index.js'
import { log } from './log.js'

interface CacheEnvelope {
  data: unknown
  cachedAt: number
}

/**
 * Cache keys are built from route params in places, so treat them as hostile:
 * a key containing a separator or `..` would let path.join escape the cache
 * directory and read or clobber arbitrary .json files.
 */
function fileFor(key: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(key) || key.includes('..')) {
    throw new Error(`Unsafe cache key: ${JSON.stringify(key)}`)
  }
  return path.join(cacheDir(), `${key}.json`)
}

export function readCache(key: string, ttlSeconds: number): unknown | null {
  try {
    const raw = fs.readFileSync(fileFor(key), 'utf8')
    const envelope = JSON.parse(raw) as CacheEnvelope
    const ageMs = Date.now() - envelope.cachedAt
    if (ageMs > ttlSeconds * 1000) return null
    return envelope.data
  } catch {
    return null
  }
}

export function writeCache(key: string, data: unknown): void {
  const envelope: CacheEnvelope = { data, cachedAt: Date.now() }
  try {
    const file = fileFor(key)
    const tmp = file + '.tmp'
    fs.mkdirSync(cacheDir(), { recursive: true })
    fs.writeFileSync(tmp, JSON.stringify(envelope))
    fs.renameSync(tmp, file)
  } catch (err) {
    log.error('cache write failed', { key, err: (err as Error).message })
  }
}

export function readStale(key: string): unknown | null {
  try {
    const raw = fs.readFileSync(fileFor(key), 'utf8')
    const envelope = JSON.parse(raw) as CacheEnvelope
    return envelope.data
  } catch {
    return null
  }
}
