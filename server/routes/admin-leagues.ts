/**
 * Admin settings API — manage leagues, access codes, manager merges and the
 * admin password. All routes require an admin session (mounted behind
 * requireAdmin in index.ts).
 */
import fs from 'node:fs'
import path from 'node:path'
import { Router } from 'express'
import { cacheDir, getDb } from '../db/index.js'
import { schedulerStatus, triggerIncremental } from '../sync/scheduler.js'
import { runBackup } from '../sync/backup.js'
import { getSleeperClient } from '../sleeper/client.js'
import { walkLeagueChain } from '../sleeper/chain.js'
import {
  LEAGUE_TYPES,
  addLeague,
  generateAccessCode,
  getLeague,
  getLeagues,
  removeLeague,
  updateLeague,
  type LeagueType,
} from '../config/leagues.js'
import {
  getSleeperUsername,
  isSetupComplete,
  setAdminPassword,
  setSleeperUsername,
  verifyAdminPassword,
} from '../auth/admin.js'
import { discoverLeagueFamilies } from '../sleeper/discover.js'
import { allLeagueSyncStatus, backfillLeague, leagueSyncStatus } from '../sync/trigger.js'
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
} from '../auth/session.js'

const router = Router()

function isType(v: unknown): v is LeagueType {
  return typeof v === 'string' && (LEAGUE_TYPES as readonly string[]).includes(v)
}

// ── Leagues ────────────────────────────────────────────────────────────────

router.get('/admin/leagues', (_req, res) => {
  const status = new Map(allLeagueSyncStatus().map((s) => [s.slug, s]))
  res.json(
    getLeagues().map((l) => ({
      slug: l.slug,
      displayName: l.displayName,
      type: l.type,
      currentLeagueId: l.currentLeagueId,
      accessCode: l.accessCode,
      themeAccent: l.themeAccent,
      sortOrder: l.sortOrder,
      addedAt: l.addedAt,
      sync: status.get(l.slug) ?? null,
    })),
  )
})

router.get('/admin/leagues/suggest-code', (_req, res) => {
  res.json({ code: generateAccessCode(getDb()) })
})

/** Discover the Sleeper leagues for a username, for the "add league" picker. */
router.get('/admin/leagues/discover', async (req, res) => {
  const username =
    (typeof req.query.username === 'string' && req.query.username.trim()) ||
    getSleeperUsername(getDb())
  if (!username) {
    res.status(400).json({ error: 'no Sleeper username — pass ?username= or save one in settings' })
    return
  }
  try {
    const families = await discoverLeagueFamilies(getSleeperClient(), username)
    const known = new Set(getLeagues().map((l) => l.currentLeagueId))
    res.json(families.map((f) => ({ ...f, alreadyAdded: known.has(f.currentLeagueId) })))
  } catch (err) {
    res.status(502).json({ error: (err as Error).message })
  }
})

router.post('/admin/leagues', async (req, res) => {
  const body = req.body as Record<string, unknown>
  const currentLeagueId = String(body.currentLeagueId ?? '').trim()
  if (!/^\d+$/.test(currentLeagueId)) {
    res.status(400).json({ error: 'currentLeagueId must be a numeric Sleeper league ID' })
    return
  }

  // Validate the ID against Sleeper and grab a default name/type.
  let defaultName: string
  let defaultType: LeagueType
  try {
    const { entries } = await walkLeagueChain(getSleeperClient(), currentLeagueId)
    if (entries.length === 0) {
      res.status(400).json({ error: 'Sleeper has no league with that ID' })
      return
    }
    const newest = entries[entries.length - 1]
    defaultName = newest.name
    const t = Number((newest.league.settings as Record<string, unknown> | undefined)?.type)
    defaultType = t === 2 ? 'dynasty' : t === 1 ? 'keeper' : 'redraft'
  } catch (err) {
    res.status(502).json({ error: `couldn't reach Sleeper: ${(err as Error).message}` })
    return
  }

  try {
    const league = addLeague({
      currentLeagueId,
      displayName: (String(body.displayName ?? '').trim() || defaultName),
      type: isType(body.type) ? body.type : defaultType,
      accessCode: typeof body.accessCode === 'string' ? body.accessCode : undefined,
      slug: typeof body.slug === 'string' ? body.slug : undefined,
      themeAccent: typeof body.themeAccent === 'string' ? body.themeAccent : null,
    })
    backfillLeague(league.slug)
    res.status(201).json({ ...league, sync: leagueSyncStatus(league.slug) })
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

router.patch('/admin/leagues/:slug', (req, res) => {
  if (!getLeague(req.params.slug)) {
    res.status(404).json({ error: 'unknown league' })
    return
  }
  const b = req.body as Record<string, unknown>
  try {
    const updated = updateLeague(req.params.slug, {
      displayName: typeof b.displayName === 'string' ? b.displayName : undefined,
      type: isType(b.type) ? b.type : undefined,
      accessCode: typeof b.accessCode === 'string' ? b.accessCode : undefined,
      currentLeagueId:
        typeof b.currentLeagueId === 'string' && /^\d+$/.test(b.currentLeagueId)
          ? b.currentLeagueId
          : undefined,
      themeAccent:
        b.themeAccent === null || typeof b.themeAccent === 'string'
          ? (b.themeAccent as string | null)
          : undefined,
      sortOrder: typeof b.sortOrder === 'number' ? b.sortOrder : undefined,
    })
    res.json(updated)
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

router.delete('/admin/leagues/:slug', (req, res) => {
  if (!getLeague(req.params.slug)) {
    res.status(404).json({ error: 'unknown league' })
    return
  }
  removeLeague(req.params.slug)
  res.json({ ok: true })
})

router.post('/admin/leagues/:slug/resync', (req, res) => {
  if (!getLeague(req.params.slug)) {
    res.status(404).json({ error: 'unknown league' })
    return
  }
  const state = backfillLeague(req.params.slug, { force: req.body?.force === true })
  res.json({ state, sync: leagueSyncStatus(req.params.slug) })
})

// ── Sync & ops status ──────────────────────────────────────────────────────

router.get('/admin/sync', (_req, res) => {
  const db = getDb()
  const recent = db
    .prepare(
      `SELECT league_id, scope, status, started_at, finished_at, error, records_written
       FROM sync_log ORDER BY id DESC LIMIT 40`,
    )
    .all()

  let backups: Array<{ file: string; bytes: number; modified: number }> = []
  try {
    const dir = path.join(cacheDir(), 'backups')
    backups = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.db'))
      .map((f) => {
        const st = fs.statSync(path.join(dir, f))
        return { file: f, bytes: st.size, modified: st.mtimeMs }
      })
      .sort((a, b) => b.modified - a.modified)
  } catch {
    /* no backups dir yet */
  }

  res.json({
    scheduler: schedulerStatus(),
    leagues: allLeagueSyncStatus(),
    recent,
    backups,
  })
})

router.post('/admin/sync/run', (_req, res) => {
  triggerIncremental()
  res.json({ started: true })
})

router.post('/admin/sync/backup', (_req, res) => {
  const file = runBackup()
  if (!file) {
    res.status(500).json({ error: 'backup failed — see server logs' })
    return
  }
  res.json({ ok: true, file: path.basename(file) })
})

// ── Settings ───────────────────────────────────────────────────────────────

router.get('/admin/settings', (_req, res) => {
  res.json({ sleeperUsername: getSleeperUsername(getDb()) ?? '' })
})

router.put('/admin/settings', (req, res) => {
  const u = req.body?.sleeperUsername
  if (typeof u === 'string') setSleeperUsername(getDb(), u)
  res.json({ sleeperUsername: getSleeperUsername(getDb()) ?? '' })
})

router.post('/admin/password', (req, res) => {
  const db = getDb()
  const { current, next } = req.body as { current?: string; next?: string }
  if (isSetupComplete(db) && !verifyAdminPassword(db, current ?? '')) {
    res.status(403).json({ error: 'current password is wrong' })
    return
  }
  try {
    setAdminPassword(db, next ?? '')
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
    return
  }
  // Refresh the caller's cookie so it stays valid after the key change is n/a
  // (session isn't tied to the password), but re-issue anyway for good measure.
  res.cookie(
    SESSION_COOKIE,
    signSession({ slugs: getLeagues(db).map((l) => l.slug), admin: true }),
    sessionCookieOptions(req.secure),
  )
  res.json({ ok: true })
})

export default router
