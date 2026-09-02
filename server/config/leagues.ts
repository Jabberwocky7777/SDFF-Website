/**
 * League configuration loader.
 *
 * Source of truth for which leagues exist, their URL slugs, their Sleeper
 * league IDs, and their per-league access codes. Never hardcode league IDs
 * anywhere else, and always validate an incoming `:slug` against this config
 * before touching the Sleeper API (PLAN.md §6.7).
 *
 * `config/leagues.json` is the single source of auth: each league's short
 * `accessCode` (and the top-level `adminCode`) are the only credentials — there
 * is no site password. In production the file is mounted as a volume so leagues
 * and codes can be changed without rebuilding the image.
 */
import fs from 'fs'
import path from 'path'
import { z } from 'zod'

const LEAGUE_TYPES = ['dynasty', 'redraft', 'keeper', 'bestball'] as const

const themeSchema = z
  .object({
    accent: z
      .string()
      .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'accent must be a hex color'),
  })
  .optional()

const leagueSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase letters, digits and dashes'),
  displayName: z.string().min(1),
  currentLeagueId: z.string().regex(/^\d+$/, 'currentLeagueId must be a numeric Sleeper ID'),
  type: z.enum(LEAGUE_TYPES),
  sortOrder: z.number().int().default(0),
  /** Short code a leaguemate enters to unlock this league. Set at setup time. */
  accessCode: z.string().trim().min(3, 'accessCode must be at least 3 characters'),
  theme: themeSchema,
})

const configSchema = z.object({
  sleeperUsername: z.string().optional(),
  leagues: z.array(leagueSchema).min(1),
  /** Unlocks every league plus the admin panel. */
  adminCode: z.string().min(1).optional(),
  /** Stale Sleeper user_id -> canonical user_id it should merge into. */
  managerAliases: z.record(z.string(), z.string()).default({}),
  /** Sleeper user_id -> display name override. */
  displayNameOverrides: z.record(z.string(), z.string()).default({}),
})

export type LeagueType = (typeof LEAGUE_TYPES)[number]
export type LeagueConfigEntry = z.infer<typeof leagueSchema>
export type LeaguesConfig = z.infer<typeof configSchema>

/** Fields safe to expose to the browser — never the access codes. */
export interface PublicLeague {
  slug: string
  displayName: string
  type: LeagueType
  sortOrder: number
  theme?: { accent: string }
}

const CONFIG_PATH =
  process.env.LEAGUES_CONFIG_PATH ?? path.join(process.cwd(), 'config', 'leagues.json')

let cached: LeaguesConfig | null = null

/** Drop helper keys like `$comment` before validation. */
function stripComments(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripComments)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([k]) => !k.startsWith('$'))
        .map(([k, v]) => [k, stripComments(v)]),
    )
  }
  return value
}

/**
 * Where the config comes from, in priority order:
 *   1. LEAGUES_JSON env var — the whole config inline (raw JSON or base64).
 *      This is the TrueNAS-friendly path: everything editable in the app UI.
 *   2. config/leagues.json file (or LEAGUES_CONFIG_PATH) — for local dev or a
 *      volume-mounted file.
 */
function readRawConfig(): { raw: string; source: string } {
  const inline = process.env.LEAGUES_JSON?.trim()
  if (inline) {
    if (inline.startsWith('{')) return { raw: inline, source: 'LEAGUES_JSON env' }
    try {
      const decoded = Buffer.from(inline, 'base64').toString('utf8').trim()
      if (decoded.startsWith('{')) return { raw: decoded, source: 'LEAGUES_JSON env (base64)' }
    } catch {
      /* fall through to the error below */
    }
    throw new Error('LEAGUES_JSON is set but is neither JSON nor base64-encoded JSON.')
  }

  try {
    return { raw: fs.readFileSync(CONFIG_PATH, 'utf8'), source: CONFIG_PATH }
  } catch {
    throw new Error(
      `No league config. Set the LEAGUES_JSON env var to the config JSON, or create ` +
        `${CONFIG_PATH} (copy config/leagues.example.json). Each league needs an accessCode.`,
    )
  }
}

export function loadLeaguesConfig(): LeaguesConfig {
  if (cached) return cached

  const { raw, source } = readRawConfig()

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(`${source} is not valid JSON: ${(err as Error).message}`, { cause: err })
  }

  const result = configSchema.safeParse(stripComments(parsed))
  if (!result.success) {
    throw new Error(
      `${source} failed validation:\n${z.prettifyError(result.error)}`,
    )
  }

  const slugs = new Set<string>()
  const codes = new Set<string>()
  for (const league of result.data.leagues) {
    if (slugs.has(league.slug)) {
      throw new Error(`${source}: duplicate league slug "${league.slug}"`)
    }
    slugs.add(league.slug)
    if (codes.has(league.accessCode)) {
      throw new Error(`${source}: two leagues share the access code "${league.accessCode}"`)
    }
    codes.add(league.accessCode)
  }
  if (result.data.adminCode && codes.has(result.data.adminCode)) {
    throw new Error(`${source}: adminCode must not match a league accessCode`)
  }
  if (!result.data.adminCode) {
    console.warn(
      `[leagues] no adminCode set in ${source} — the admin panel and cross-league access are disabled`,
    )
  }

  cached = result.data
  return cached
}

/** Test/hot-reload helper. */
export function clearLeaguesConfigCache(): void {
  cached = null
}

export function getLeagues(): LeagueConfigEntry[] {
  return [...loadLeaguesConfig().leagues].sort((a, b) => a.sortOrder - b.sortOrder)
}

export function getLeague(slug: string): LeagueConfigEntry | undefined {
  return loadLeaguesConfig().leagues.find((l) => l.slug === slug)
}

export function isKnownSlug(slug: string): boolean {
  return getLeague(slug) !== undefined
}

export function toPublicLeague(league: LeagueConfigEntry): PublicLeague {
  return {
    slug: league.slug,
    displayName: league.displayName,
    type: league.type,
    sortOrder: league.sortOrder,
    theme: league.theme,
  }
}

/**
 * Resolve an access code to the set of league slugs it unlocks.
 * The admin code unlocks everything. Returns `{ admin, slugs }`.
 */
export function resolveAccessCode(code: string): { admin: boolean; slugs: string[] } {
  const config = loadLeaguesConfig()
  const trimmed = code.trim()
  if (!trimmed) return { admin: false, slugs: [] }

  if (config.adminCode && timingSafeEqual(trimmed, config.adminCode)) {
    return { admin: true, slugs: config.leagues.map((l) => l.slug) }
  }

  const slugs = config.leagues
    .filter((l) => timingSafeEqual(trimmed, l.accessCode))
    .map((l) => l.slug)
  return { admin: false, slugs }
}

/** Constant-time string compare to avoid leaking code length/prefix via timing. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}
