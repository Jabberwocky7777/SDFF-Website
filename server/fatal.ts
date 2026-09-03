/**
 * Startup diagnostics that survive a fast crash.
 *
 * `console.*` is asynchronous when stdout/stderr is a pipe (Docker), and
 * `process.exit()` drops whatever is still buffered. These helpers use
 * `fs.writeSync` on BOTH fd 1 and fd 2 so the message lands regardless of which
 * stream the log viewer shows.
 */
import fs from 'node:fs'

function writeSync(fd: number, s: string): void {
  try {
    fs.writeSync(fd, s)
  } catch {
    /* ignore */
  }
}

/** Sync trace line to stdout — shows exactly how far startup got before a crash. */
export function trace(msg: string): void {
  writeSync(1, `[trace] ${msg}\n`)
}

export function fatal(message: string, err?: unknown): void {
  const detail =
    err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : err != null ? String(err) : ''
  const line = `\n[FATAL] ${message}\n${detail}\n\n`
  writeSync(1, line) // stdout — the stream the log viewer definitely shows
  writeSync(2, line) // stderr too, just in case
}

export function die(message: string, err?: unknown): never {
  fatal(message, err)
  process.exit(1)
}
