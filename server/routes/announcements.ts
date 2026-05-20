import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

const router = Router()

const DATA_DIR = process.env.CACHE_DIR ?? path.join(process.cwd(), 'cache')
const FILE = path.join(DATA_DIR, 'announcements.json')
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD

interface Announcement {
  id: string
  title: string
  body: string
  createdAt: string
  pinned?: boolean
}

function readAnnouncements(): Announcement[] {
  try {
    const raw = fs.readFileSync(FILE, 'utf8')
    return JSON.parse(raw) as Announcement[]
  } catch {
    return []
  }
}

function writeAnnouncements(list: Announcement[]): void {
  const tmp = FILE + '.tmp'
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2))
    fs.renameSync(tmp, FILE)
  } catch (err) {
    console.error('[announcements] write error:', err)
  }
}

function sorted(list: Announcement[]): Announcement[] {
  return [...list].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
}

function requireAdmin(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) {
  if (!ADMIN_PASSWORD) {
    res.status(503).json({ error: 'Admin password not configured' })
    return
  }
  if (req.headers['x-admin-key'] !== ADMIN_PASSWORD) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}

// GET /api/announcements — returns sorted list
router.get('/announcements', (_req, res) => {
  res.json(sorted(readAnnouncements()))
})

// POST /api/announcements — create
router.post('/announcements', requireAdmin, (req, res) => {
  const { title, body, pinned } = req.body as { title?: string; body?: string; pinned?: boolean }
  if (!title?.trim() || !body?.trim()) {
    res.status(400).json({ error: 'title and body are required' })
    return
  }
  const announcement: Announcement = {
    id: randomUUID(),
    title: title.trim(),
    body: body.trim(),
    createdAt: new Date().toISOString(),
    pinned: Boolean(pinned),
  }
  const list = readAnnouncements()
  list.push(announcement)
  writeAnnouncements(list)
  res.status(201).json(announcement)
})

// DELETE /api/announcements/:id
router.delete('/announcements/:id', requireAdmin, (req, res) => {
  const list = readAnnouncements()
  const next = list.filter((a) => a.id !== req.params.id)
  if (next.length === list.length) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  writeAnnouncements(next)
  res.json({ ok: true })
})

// PATCH /api/announcements/:id/pin — toggle pinned
router.patch('/announcements/:id/pin', requireAdmin, (req, res) => {
  const list = readAnnouncements()
  const item = list.find((a) => a.id === req.params.id)
  if (!item) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  item.pinned = !item.pinned
  writeAnnouncements(list)
  res.json(item)
})

export default router
