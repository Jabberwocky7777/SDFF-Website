/**
 * Small-file persistence in the cache directory.
 *
 * The app keeps a handful of things outside SQLite — announcements, the
 * commissioner's dues and championship overrides, the squad-pot balance, the
 * uploaded rankings CSV, and the Sleeper response cache. Each of those had
 * grown its own copy of "mkdir, write .tmp, rename", with three different
 * answers to what happens when the write fails. This is the one copy.
 *
 * Writes go through a temp file and a rename so a crash mid-write leaves the
 * previous version intact rather than a truncated file.
 */
import fs from 'node:fs'
import path from 'node:path'
import { cacheDir } from '../db/index.js'

/** Rejects anything that could escape the cache directory. */
function resolveInCacheDir(name: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(name) || name.includes('..')) {
    throw new Error(`Unsafe cache file name: ${JSON.stringify(name)}`)
  }
  return path.join(cacheDir(), name)
}

/**
 * Absolute path of a cache file, validated by the same rule as every read and
 * write. Exported so callers can stat a cache file (to detect a change) without
 * reading it, and so they inherit the traversal guard rather than rebuilding it.
 * Throws on an unsafe name.
 */
export function cacheFilePath(name: string): string {
  return resolveInCacheDir(name)
}

/** Atomically replace a file in the cache dir. Throws if the write fails. */
export function writeCacheFile(name: string, contents: string): void {
  const file = resolveInCacheDir(name)
  const tmp = `${file}.tmp`
  fs.mkdirSync(cacheDir(), { recursive: true })
  fs.writeFileSync(tmp, contents, 'utf8')
  fs.renameSync(tmp, file)
}

/** Read a file from the cache dir, or null if it isn't there / isn't readable. */
export function readCacheFile(name: string): string | null {
  try {
    return fs.readFileSync(resolveInCacheDir(name), 'utf8')
  } catch {
    return null
  }
}

/**
 * Read and parse a JSON file, falling back when it is missing or corrupt.
 * A missing file is the normal state before the commissioner has saved
 * anything, so it is not treated as an error.
 */
export function readJsonFile<T>(name: string, fallback: T): T {
  const raw = readCacheFile(name)
  if (raw === null) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** Atomically write a JSON file, pretty-printed so it stays hand-editable. */
export function writeJsonFile(name: string, data: unknown): void {
  writeCacheFile(name, JSON.stringify(data, null, 2))
}
