/**
 * League registry — DB-backed (`league_family` table).
 *
 * The commissioner adds / edits / removes leagues and sets their access codes
 * from the in-app admin settings screen; nothing is configured via files or env
 * vars at runtime. `getLeagues()` is the synchronous source of truth used by
 * routing, auth and sync. A small in-memory cache is invalidated on every write.
 *
 * Always validate an incoming `:slug` against this registry before touching the
 * Sleeper API (PLAN.md §6.7).
 */
import crypto from 'node:crypto'
import { getDb, type DB } from '../db/index.js'
import { verifyAdminPassword } from '../auth/admin.js'

export const LEAGUE_TYPES = ['dynasty', 'redraft', 'keeper', 'bestball'] as const
export type LeagueType = (typeof LEAGUE_TYPES)[number]

export interface LeagueRecord {
  id: number
  slug: string
  displayName: string
  type: LeagueType
  currentLeagueId: string
  sortOrder: number
  accessCode: string
  themeAccent: string | null
  /** Convenience for callers that expect the old `theme` shape. */
  theme: { accent: string } | null
  addedAt: number | null
}

/** Fields safe to expose to the browser — never the access code. */
export interface PublicLeague {
  slug: string
  displayName: string
  type: LeagueType
  sortOrder: number
  theme?: { accent: string }
}

interface Row {
  id: number
  slug: string
  display_name: string
  league_type: string
  current_league_id: string
  sort_order: number
  access_code: string
  theme_accent: string | null
  added_at: number | null
}

let cache: LeagueRecord[] | null = null

export function invalidateLeagueCache(): void {
  cache = null
}
/** Back-compat alias. */
export const clearLeaguesConfigCache = invalidateLeagueCache

function toRecord(r: Row): LeagueRecord {
  return {
    id: r.id,
    slug: r.slug,
    displayName: r.display_name,
    type: (LEAGUE_TYPES as readonly string[]).includes(r.league_type)
      ? (r.league_type as LeagueType)
      : 'redraft',
    currentLeagueId: r.current_league_id,
    sortOrder: r.sort_order,
    accessCode: r.access_code,
    themeAccent: r.theme_accent,
    theme: r.theme_accent ? { accent: r.theme_accent } : null,
    addedAt: r.added_at,
  }
}

export function getLeagues(db: DB = getDb()): LeagueRecord[] {
  if (cache) return cache
  const rows = db
    .prepare(`SELECT * FROM league_family ORDER BY sort_order, display_name`)
    .all() as Row[]
  cache = rows.map(toRecord)
  return cache
}

export function getLeague(slug: string): LeagueRecord | undefined {
  return getLeagues().find((l) => l.slug === slug)
}

export function isKnownSlug(slug: string): boolean {
  return getLeague(slug) !== undefined
}

export function toPublicLeague(l: LeagueRecord): PublicLeague {
  return {
    slug: l.slug,
    displayName: l.displayName,
    type: l.type,
    sortOrder: l.sortOrder,
    theme: l.theme ?? undefined,
  }
}

// ── Mutations (admin) ───────────────────────────────────────────────────────

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'league'
  )
}

function uniqueSlug(db: DB, base: string, ignoreId?: number): string {
  const taken = new Set(
    (
      db.prepare(`SELECT id, slug FROM league_family`).all() as Array<{ id: number; slug: string }>
    )
      .filter((r) => r.id !== ignoreId)
      .map((r) => r.slug),
  )
  if (!taken.has(base)) return base
  for (let i = 2; i < 100; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`
  return `${base}-${Date.now()}`
}

export function generateAccessCode(db: DB): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no ambiguous chars
  const existing = new Set(
    (db.prepare(`SELECT access_code FROM league_family`).all() as Array<{ access_code: string }>).map(
      (r) => r.access_code,
    ),
  )
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = ''
    for (let i = 0; i < 4; i++) code += alphabet[crypto.randomInt(alphabet.length)]
    if (!existing.has(code)) return code
  }
  return crypto.randomBytes(3).toString('hex').toUpperCase()
}

export interface AddLeagueInput {
  currentLeagueId: string
  displayName: string
  type: LeagueType
  accessCode?: string
  slug?: string
  themeAccent?: string | null
  sortOrder?: number
}

export function addLeague(input: AddLeagueInput, db: DB = getDb()): LeagueRecord {
  const code = (input.accessCode ?? generateAccessCode(db)).trim().toUpperCase()
  assertCodeUsable(db, code)

  const slug = uniqueSlug(db, input.slug ? slugify(input.slug) : slugify(input.displayName))
  const maxOrder =
    (db.prepare(`SELECT MAX(sort_order) m FROM league_family`).get() as { m: number | null }).m ?? 0

  const info = db
    .prepare(
      `INSERT INTO league_family
         (slug, display_name, league_type, current_league_id, sort_order, access_code, theme_accent, added_at)
       VALUES (@slug, @displayName, @type, @currentLeagueId, @sortOrder, @accessCode, @themeAccent, @addedAt)`,
    )
    .run({
      slug,
      displayName: input.displayName.trim(),
      type: input.type,
      currentLeagueId: input.currentLeagueId,
      sortOrder: input.sortOrder ?? maxOrder + 1,
      accessCode: code,
      themeAccent: input.themeAccent ?? null,
      addedAt: Date.now(),
    })

  invalidateLeagueCache()
  return getLeagues(db).find((l) => l.id === Number(info.lastInsertRowid))!
}

export interface UpdateLeagueInput {
  displayName?: string
  type?: LeagueType
  accessCode?: string
  currentLeagueId?: string
  themeAccent?: string | null
  sortOrder?: number
}

export function updateLeague(slug: string, patch: UpdateLeagueInput, db: DB = getDb()): LeagueRecord {
  const existing = getLeague(slug)
  if (!existing) throw new Error(`Unknown league "${slug}"`)

  if (patch.accessCode !== undefined) {
    const code = patch.accessCode.trim().toUpperCase()
    assertCodeUsable(db, code, existing.id)
    patch.accessCode = code
  }

  const fields: string[] = []
  const params: Record<string, unknown> = { slug }
  const map: Record<string, string> = {
    displayName: 'display_name',
    type: 'league_type',
    accessCode: 'access_code',
    currentLeagueId: 'current_league_id',
    themeAccent: 'theme_accent',
    sortOrder: 'sort_order',
  }
  for (const [k, col] of Object.entries(map)) {
    const v = (patch as Record<string, unknown>)[k]
    if (v !== undefined) {
      fields.push(`${col} = @${k}`)
      params[k] = typeof v === 'string' ? v.trim() : v
    }
  }
  if (fields.length) {
    db.prepare(`UPDATE league_family SET ${fields.join(', ')} WHERE slug = @slug`).run(params)
    invalidateLeagueCache()
  }
  return getLeague(slug)!
}

export function removeLeague(slug: string, db: DB = getDb()): void {
  // FK cascade drops every season / matchup / trade / draft row for this family.
  db.prepare(`DELETE FROM league_family WHERE slug = ?`).run(slug)
  invalidateLeagueCache()
}

function assertCodeUsable(db: DB, code: string, ignoreId?: number): void {
  if (code.length < 3) throw new Error('Access code must be at least 3 characters.')
  const clash = (
    db.prepare(`SELECT id FROM league_family WHERE access_code = ?`).all(code) as Array<{
      id: number
    }>
  ).some((r) => r.id !== ignoreId)
  if (clash) throw new Error(`Access code "${code}" is already used by another league.`)
}

// ── Access-code resolution (login) ──────────────────────────────────────────

/**
 * Resolve a login code: the admin password unlocks everything; a league's
 * access code unlocks that league.
 */
export function resolveAccessCode(code: string): { admin: boolean; slugs: string[] } {
  const db = getDb()
  const trimmed = code.trim()
  if (!trimmed) return { admin: false, slugs: [] }

  if (verifyAdminPassword(db, trimmed)) {
    return { admin: true, slugs: getLeagues(db).map((l) => l.slug) }
  }

  const upper = trimmed.toUpperCase()
  const slugs = getLeagues(db)
    .filter((l) => timingSafeEqual(l.accessCode, upper))
    .map((l) => l.slug)
  return { admin: false, slugs }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}
