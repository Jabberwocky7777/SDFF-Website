/**
 * Nightly SQLite backup. `VACUUM INTO` writes a clean, defragmented
 * copy of the database to `<cacheDir>/backups/sdff-YYYY-MM-DD.db` — safe to run
 * on a live connection. Keeps the most recent BACKUP_KEEP files (default 7).
 *
 * Disabled by SYNC_ENABLED=0 (shares the flag with the sync scheduler) or
 * BACKUP_ENABLED=0. In dev it only runs with SYNC_IN_DEV=1.
 */
import fs from 'node:fs'
import path from 'node:path'
import cron from 'node-cron'
import { cacheDir, getDb } from '../db/index.js'
import { log } from '../log.js'

const KEEP = Math.max(1, Number(process.env.BACKUP_KEEP ?? 7))

export function runBackup(): string | null {
  const dir = path.join(cacheDir(), 'backups')
  try {
    fs.mkdirSync(dir, { recursive: true })
    const stamp = new Date().toISOString().slice(0, 10)
    const dest = path.join(dir, `sdff-${stamp}.db`)
    // VACUUM INTO refuses to overwrite — clear a same-day run first.
    fs.rmSync(dest, { force: true })
    getDb().prepare('VACUUM INTO ?').run(dest)

    const bytes = fs.statSync(dest).size
    log.info('backup written', { file: path.basename(dest), bytes })

    const old = fs
      .readdirSync(dir)
      .filter((f) => /^sdff-\d{4}-\d{2}-\d{2}\.db$/.test(f))
      .sort()
      .slice(0, -KEEP)
    for (const f of old) fs.rmSync(path.join(dir, f), { force: true })
    return dest
  } catch (err) {
    log.error('backup failed', { err: (err as Error).message })
    return null
  }
}

export function startBackupJob(): void {
  const isDev = process.env.NODE_ENV !== 'production'
  if (process.env.SYNC_ENABLED === '0' || process.env.BACKUP_ENABLED === '0') {
    log.info('backup job disabled')
    return
  }
  if (isDev && process.env.SYNC_IN_DEV !== '1') return

  const tz = process.env.TZ || 'America/New_York'
  cron.schedule('23 4 * * *', () => void runBackup(), { timezone: tz })
  log.info('backup job scheduled', { at: '04:23', tz, keep: KEEP })
}
