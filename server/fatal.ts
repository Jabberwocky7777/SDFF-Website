/**
 * Report a fatal startup error so it actually reaches the container log.
 *
 * `console.error(...)` writes to stderr asynchronously when it's a pipe (the
 * normal case in Docker), and `process.exit()` drops anything still buffered.
 * `fs.writeSync` on fd 2 completes before it returns, so the message survives.
 */
import fs from 'node:fs'

export function die(message: string, err?: unknown): never {
  const detail =
    err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : err != null ? String(err) : ''
  try {
    fs.writeSync(2, `\n[FATAL] ${message}\n${detail}\n\n`)
  } catch {
    /* nothing else we can do */
  }
  process.exit(1)
}
