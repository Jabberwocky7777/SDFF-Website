/**
 * Minimal structured logger — one JSON object per line to stdout (info/debug)
 * or stderr (warn/error), so `docker logs` / a log shipper can parse it.
 *
 * Deliberately dependency-free: this container has a history of native-module
 * deploy failures, and a logging library isn't worth reintroducing that risk.
 * The API mirrors the subset of pino we'd use, so swapping it in later is a
 * drop-in if structured-logging needs grow.
 *
 * `fatal.ts` stays separate — it's the last-resort synchronous path for
 * startup/crash errors that must survive `process.exit()`.
 */
import fs from 'node:fs'
import type { NextFunction, Request, Response } from 'express'

type Level = 'debug' | 'info' | 'warn' | 'error'

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const MIN =
  LEVELS[(process.env.LOG_LEVEL as Level) in LEVELS ? (process.env.LOG_LEVEL as Level) : 'info']

function emit(level: Level, msg: string, fields?: Record<string, unknown>): void {
  if (LEVELS[level] < MIN) return
  const rec = { t: new Date().toISOString(), level, msg, ...fields }
  let line: string
  try {
    line = JSON.stringify(rec)
  } catch {
    line = JSON.stringify({ t: rec.t, level, msg })
  }
  fs.writeSync(level === 'warn' || level === 'error' ? 2 : 1, line + '\n')
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit('debug', msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit('error', msg, fields),
}

/** One structured line per request, emitted when the response finishes. */
export function httpLogger(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint()
  // `originalUrl` is immutable; `req.path` gets rewritten by mounted routers.
  const path = req.originalUrl.split('?')[0]
  res.on('finish', () => {
    // Skip the static asset firehose; keep API + document requests.
    if (path.startsWith('/assets/')) return
    const ms = Number(process.hrtime.bigint() - start) / 1e6
    emit(res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info', 'http', {
      method: req.method,
      path,
      status: res.statusCode,
      ms: Math.round(ms),
    })
  })
  next()
}
