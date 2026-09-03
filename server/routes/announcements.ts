import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { requireAdmin } from '../auth/middleware.js'
import { cacheDir } from '../db/index.js'

const router = Router()

const FILE = () => path.join(cacheDir(), 'announcements.json')

interface Announcement {
  id: string
  title: string
  body: string
  createdAt: string
  pinned?: boolean
}

function readAnnouncements(): Announcement[] {
  try {
    const raw = fs.readFileSync(FILE(), 'utf8')
    return JSON.parse(raw) as Announcement[]
  } catch {
    return []
  }
}

function writeAnnouncements(list: Announcement[]): void {
  const f = FILE(); const tmp = f + '.tmp'
  try {
    fs.mkdirSync(cacheDir(), { recursive: true })
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2))
    fs.renameSync(tmp, f)
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
