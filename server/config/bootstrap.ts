/**
 * One-time migration from the old file/env league config into the DB.
 *
 * Runs on startup only when the DB has no leagues yet. After this the admin
 * settings screen is the sole way to manage leagues; the file / LEAGUES_JSON
 * env var is never read again.
 */
import type { DB } from '../db/index.js'
import { addLeague, getLeagues } from './leagues.js'
import {
  MIN_PASSWORD_LENGTH,
  isSetupComplete,
  setAdminPassword,
  setSleeperUsername,
} from '../auth/admin.js'
import { setManagerAlias } from '../sync/upsert.js'
import { readLegacyConfig } from './legacyImport.js'

export async function bootstrapLeaguesIfEmpty(db: DB): Promise<void> {
  if (getLeagues(db).length > 0) return

  const legacy = readLegacyConfig()
  if (!legacy) return // fresh install — the browser setup flow takes over

  console.log(`[import] migrating ${legacy.leagues.length} league(s) from the legacy config…`)
  for (const l of legacy.leagues) {
    try {
      addLeague(
        {
          currentLeagueId: l.currentLeagueId,
          displayName: l.displayName,
          type: l.type,
          accessCode: l.accessCode,
          slug: l.slug,
          themeAccent: l.theme?.accent ?? null,
          sortOrder: l.sortOrder,
        },
        db,
      )
    } catch (err) {
      console.warn(`[import] skipped "${l.displayName}": ${(err as Error).message}`)
    }
  }

  for (const [alias, canonical] of Object.entries(legacy.managerAliases)) {
    setManagerAlias(db, alias, canonical)
  }

  if (legacy.sleeperUsername) setSleeperUsername(db, legacy.sleeperUsername)

  if (legacy.adminCode && !isSetupComplete(db)) {
    if (legacy.adminCode.length >= MIN_PASSWORD_LENGTH) {
      await setAdminPassword(db, legacy.adminCode)
      console.log('[import] admin password set from the legacy adminCode')
    } else {
      console.warn(
        `[import] legacy adminCode is shorter than ${MIN_PASSWORD_LENGTH} chars — ` +
          'set a new admin password in the app',
      )
    }
  }

  console.log('[import] done — manage leagues from the admin settings screen from now on')
}
