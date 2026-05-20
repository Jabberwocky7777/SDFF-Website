import fs from 'fs'
import path from 'path'

const CACHE_DIR = process.env.CACHE_DIR ?? path.join(process.cwd(), 'cache')

interface CacheEnvelope {
  data: unknown
  cachedAt: number
}

export function readCache(key: string, ttlSeconds: number): unknown | null {
  const file = path.join(CACHE_DIR, `${key}.json`)
  try {
    const raw = fs.readFileSync(file, 'utf8')
    const envelope = JSON.parse(raw) as CacheEnvelope
    const ageMs = Date.now() - envelope.cachedAt
    if (ageMs > ttlSeconds * 1000) return null
    return envelope.data
  } catch {
    return null
  }
}

export function writeCache(key: string, data: unknown): void {
  const file = path.join(CACHE_DIR, `${key}.json`)
  const tmp = file + '.tmp'
  const envelope: CacheEnvelope = { data, cachedAt: Date.now() }
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
    fs.writeFileSync(tmp, JSON.stringify(envelope))
    fs.renameSync(tmp, file)
  } catch (err) {
    console.error('[cache] write error:', err)
  }
}

export function readStale(key: string): unknown | null {
  const file = path.join(CACHE_DIR, `${key}.json`)
  try {
    const raw = fs.readFileSync(file, 'utf8')
    const envelope = JSON.parse(raw) as CacheEnvelope
    return envelope.data
  } catch {
    return null
  }
}
