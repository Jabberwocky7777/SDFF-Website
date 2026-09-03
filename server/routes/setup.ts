/**
 * First-run setup: create the commissioner (admin) password. Once set, this
 * endpoint is closed and everything else is managed from the admin settings UI.
 */
import { Router } from 'express'
import { getDb } from '../db/index.js'
import { isSetupComplete, setAdminPassword } from '../auth/admin.js'
import { getLeagues } from '../config/leagues.js'
import { SESSION_COOKIE, sessionCookieOptions, signSession } from '../auth/session.js'

const router = Router()

router.get('/setup/status', (_req, res) => {
  const db = getDb()
  res.json({
    needsSetup: !isSetupComplete(db),
    hasLeagues: getLeagues(db).length > 0,
  })
})

router.post('/setup', async (req, res) => {
  const db = getDb()
  if (isSetupComplete(db)) {
    res.status(409).json({ error: 'already set up' })
    return
  }
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  try {
    await setAdminPassword(db, password)
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
    return
  }
  const slugs = getLeagues(db).map((l) => l.slug)
  res.cookie(SESSION_COOKIE, signSession({ slugs, admin: true }), sessionCookieOptions(req.secure))
  res.json({ authed: true, admin: true, slugs })
})

export default router
