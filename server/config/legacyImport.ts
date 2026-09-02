/**
 * One-time importer for the pre-DB league config (a JSON file or LEAGUES_JSON
 * env var). Kept only so existing deployments carry their leagues + admin code
 * into the DB on first boot. After that, everything is managed from the admin
 * settings screen and this is never read again.
 */
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

const LEAGUE_TYPES = ['dynasty', 'redraft', 'keeper', 'bestball'] as const

const legacyLeague = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
  displayName: z.string().min(1),
  currentLeagueId: z.string().regex(/^\d+$/),
  type: z.enum(LEAGUE_TYPES),
  sortOrder: z.number().int().default(0),
  accessCode: z.string().trim().min(3),
  theme: z.object({ accent: z.string() }).partial().optional(),
})

const legacySchema = z.object({
  sleeperUsername: z.string().optional(),
  adminCode: z.string().min(1).optional(),
  leagues: z.array(legacyLeague).min(1),
  managerAliases: z.record(z.string(), z.string()).default({}),
})

export type LegacyConfig = z.infer<typeof legacySchema>

function stripComments(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripComments)
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([k]) => !k.startsWith('$'))
        .map(([k, val]) => [k, stripComments(val)]),
    )
  }
  return v
}

/** Returns the parsed legacy config, or null if there's nothing to import. */
export function readLegacyConfig(): LegacyConfig | null {
  const inline = process.env.LEAGUES_JSON?.trim()
  let raw: string
  if (inline) {
    raw = inline.startsWith('{') ? inline : Buffer.from(inline, 'base64').toString('utf8').trim()
  } else {
    const file =
      process.env.LEAGUES_CONFIG_PATH ?? path.join(process.cwd(), 'config', 'leagues.json')
    try {
      raw = fs.readFileSync(file, 'utf8')
    } catch {
      return null
    }
  }

  if (!raw.startsWith('{')) return null

  const parsed = legacySchema.safeParse(stripComments(JSON.parse(raw)))
  if (!parsed.success) {
    console.warn('[import] legacy league config is invalid, skipping:', z.prettifyError(parsed.error))
    return null
  }
  return parsed.data
}
