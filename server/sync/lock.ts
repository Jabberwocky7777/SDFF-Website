/**
 * Process-wide "a sync is in progress" flag, shared by the auto-backfill,
 * the cron scheduler and the manual trigger so they never run concurrently.
 */
let holder: string | null = null

export function acquireSyncLock(who: string): boolean {
  if (holder) return false
  holder = who
  return true
}

export function releaseSyncLock(): void {
  holder = null
}

export function syncLockHolder(): string | null {
  return holder
}
