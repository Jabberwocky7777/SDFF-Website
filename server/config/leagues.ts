/**
 * League configuration loader.
 *
 * Source of truth for which leagues exist, their URL slugs, their Sleeper
 * league IDs, and their per-league access codes. Never hardcode league IDs
 * anywhere else, and always validate an incoming `:slug` against this config
 * before touching the Sleeper API (PLAN.md §6.7).
 *
 * Backward-compat: if `config/leagues.json` is absent but `LEAGUE_ID` is set,
 * a one-league config is synthesized from the env vars so the existing
 * single-league deployment keeps working through the migration (PLAN.md §3).
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
  /** Short code a leaguemate enters to view this league's history. */
  accessCode: z.string().min(1),
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

function synthesizeFromEnv(): LeaguesConfig | null {
  const leagueId = process.env.LEAGUE_ID
  if (!leagueId) return null
  const accessCode = process.env.SITE_PASSWORD ?? 'SDFF'
  console.warn(
    '[leagues] config/leagues.json not found — synthesizing a one-league config from LEAGUE_ID. ' +
      'Create config/leagues.json to run multi-league.',
  )
  return configSchema.parse({
    leagues: [
      {
        slug: 'sdff',
        displayName: 'Squad Dynasty Fantasy Football',
        currentLeagueId: leagueId,
        type: 'dynasty',
        sortOrder: 1,
        accessCode,
        theme: { accent: '#E0B544' },
      },
    ],
    adminCode: process.env.ADMIN_PASSWORD,
    managerAliases: {},
    displayNameOverrides: {},
  })
}

export function loadLeaguesConfig(): LeaguesConfig {
  if (cached) return cached

  let raw: string | null = null
  try {
    raw = fs.readFileSync(CONFIG_PATH, 'utf8')
  } catch {
    raw = null
  }

  if (raw == null) {
    const fromEnv = synthesizeFromEnv()
    if (!fromEnv) {
      throw new Error(
        `No league configuration found. Create ${CONFIG_PATH} (see config/leagues.example.json) ` +
          'or set the LEAGUE_ID env var for single-league mode.',
      )
    }
    cached = fromEnv
    return cached
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(`${CONFIG_PATH} is not valid JSON: ${(err as Error).message}`)
  }

  const result = configSchema.safeParse(stripComments(parsed))
  if (!result.success) {
    throw new Error(
      `${CONFIG_PATH} failed validation:\n${z.prettifyError(result.error)}`,
    )
  }

  const slugs = new Set<string>()
  for (const league of result.data.leagues) {
    if (slugs.has(league.slug)) {
      throw new Error(`${CONFIG_PATH}: duplicate league slug "${league.slug}"`)
    }
    slugs.add(league.slug)
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
