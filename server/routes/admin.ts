/**
 * Commissioner-maintained overrides for facts Sleeper doesn't carry: who has
 * paid dues, championship results predating the league's Sleeper history, and
 * the squad-pot balance.
 *
 * The split is deliberate. Writes are mounted under /admin and gated with
 * requireAdmin; the reads are unprefixed and need only a session, because the
 * dues table and championship banners are league-member-facing pages. The
 * blanket requireAuth in index.ts is what keeps them off the public internet.
 */
import { Router } from 'express'
import { requireAdmin } from '../auth/middleware.js'
import { readJsonFile, writeJsonFile } from '../lib/jsonFile.js'

const router = Router()

// ── Dues overrides ──────────────────────────────────────────────────────────

const DUES_FILE = 'dues-overrides.json'

router.get('/dues-overrides', (_req, res) => {
  res.json(readJsonFile<Record<string, string>>(DUES_FILE, {}))
})

router.post('/admin/dues', requireAdmin, (req, res) => {
  const { managerName, year, status } = req.body as {
    managerName?: string
    year?: string | number
    status?: string
  }
  if (!managerName || !year || !status) {
    res.status(400).json({ error: 'managerName, year, and status are required' })
    return
  }
  if (status !== 'paid' && status !== 'unpaid') {
    res.status(400).json({ error: 'status must be paid or unpaid' })
    return
  }
  const overrides = readJsonFile<Record<string, string>>(DUES_FILE, {})
  overrides[`${managerName}_${year}`] = status
  writeJsonFile(DUES_FILE, overrides)
  res.json({ ok: true })
})

// ── Championship overrides ──────────────────────────────────────────────────

interface ChampionshipOverride {
  year: number
  champion?: string | null
  runnerUp?: string | null
  thirdPlace?: string | null
  regularSeasonWinner?: string | null
}

type ChampionshipStringField = Exclude<keyof ChampionshipOverride, 'year'>

const CHAMP_FILE = 'championship-overrides.json'

router.get('/championship-overrides', (_req, res) => {
  res.json(readJsonFile<ChampionshipOverride[]>(CHAMP_FILE, []))
})

router.post('/admin/championship', requireAdmin, (req, res) => {
  const { year, field, value } = req.body as {
    year?: number
    field?: string
    value?: string | null
  }
  if (!year || !field) {
    res.status(400).json({ error: 'year and field are required' })
    return
  }
  const validFields = ['champion', 'runnerUp', 'thirdPlace', 'regularSeasonWinner']
  if (!validFields.includes(field)) {
    res.status(400).json({ error: `field must be one of: ${validFields.join(', ')}` })
    return
  }
  const overrides = readJsonFile<ChampionshipOverride[]>(CHAMP_FILE, [])
  const existing = overrides.find((o) => o.year === year)
  if (existing) {
    existing[field as ChampionshipStringField] = value ?? null
  } else {
    overrides.push({ year, [field]: value ?? null })
  }
  writeJsonFile(CHAMP_FILE, overrides)
  res.json({ ok: true })
})

// ── Squad Pot override ──────────────────────────────────────────────────────

const SQUAD_POT_FILE = 'squad-pot.json'

router.get('/squad-pot', (_req, res) => {
  res.json(readJsonFile<{ balance: number | null }>(SQUAD_POT_FILE, { balance: null }))
})

router.post('/admin/squad-pot', requireAdmin, (req, res) => {
  const { balance } = req.body as { balance?: number }
  if (balance === undefined || balance === null || typeof balance !== 'number') {
    res.status(400).json({ error: 'balance must be a number' })
    return
  }
  writeJsonFile(SQUAD_POT_FILE, { balance })
  res.json({ ok: true })
})

export default router
