import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { requireAdmin } from '../auth/middleware.js'

const router = Router()

const DATA_DIR = process.env.CACHE_DIR ?? path.join(process.cwd(), 'cache')

function filePath(name: string) {
  return path.join(DATA_DIR, name)
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

function writeJson(file: string, data: unknown): void {
  const tmp = file + '.tmp'
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, file)
}

// ── Dues overrides ──────────────────────────────────────────────────────────

const DUES_FILE = filePath('dues-overrides.json')

router.get('/dues-overrides', (_req, res) => {
  res.json(readJson<Record<string, string>>(DUES_FILE, {}))
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
  const overrides = readJson<Record<string, string>>(DUES_FILE, {})
  overrides[`${managerName}_${year}`] = status
  writeJson(DUES_FILE, overrides)
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

const CHAMP_FILE = filePath('championship-overrides.json')

router.get('/championship-overrides', (_req, res) => {
  res.json(readJson<ChampionshipOverride[]>(CHAMP_FILE, []))
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
  const overrides = readJson<ChampionshipOverride[]>(CHAMP_FILE, [])
  const existing = overrides.find((o) => o.year === year)
  if (existing) {
    existing[field as ChampionshipStringField] = value ?? null
  } else {
    overrides.push({ year, [field]: value ?? null })
  }
  writeJson(CHAMP_FILE, overrides)
  res.json({ ok: true })
})

// ── Squad Pot override ──────────────────────────────────────────────────────

const SQUAD_POT_FILE = filePath('squad-pot.json')

router.get('/squad-pot', (_req, res) => {
  res.json(readJson<{ balance: number | null }>(SQUAD_POT_FILE, { balance: null }))
})

router.post('/admin/squad-pot', requireAdmin, (req, res) => {
  const { balance } = req.body as { balance?: number }
  if (balance === undefined || balance === null || typeof balance !== 'number') {
    res.status(400).json({ error: 'balance must be a number' })
    return
  }
  writeJson(SQUAD_POT_FILE, { balance })
  res.json({ ok: true })
})

export default router
