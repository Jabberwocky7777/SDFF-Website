/**
 * Enumerate the Sleeper league families a user belongs to — powers the admin
 * "add league" picker and the `leagues:discover` CLI.
 */
import type { SleeperClient } from './client.js'
import { walkLeagueChain } from './chain.js'

export interface DiscoveredFamily {
  currentLeagueId: string
  name: string
  latestSeason: number
  seasonsAvailable: number
  seasonRange: [number, number] | null
  type: 'dynasty' | 'keeper' | 'redraft'
}

export async function discoverLeagueFamilies(
  client: SleeperClient,
  username: string,
  opts: { seasons?: number[] } = {},
): Promise<DiscoveredFamily[]> {
  const user = await client.getUser(username)
  if (!user) throw new Error(`No Sleeper user "${username}"`)

  const now = new Date().getFullYear()
  const seasons = opts.seasons ?? Array.from({ length: 12 }, (_, i) => now - 10 + i)

  // league_id -> newest season it appears in
  const newest = new Map<string, { season: number; name: string }>()
  for (const season of seasons) {
    for (const lg of await client.getUserLeagues(user.user_id, season)) {
      const prev = newest.get(lg.league_id)
      if (!prev || season > prev.season) newest.set(lg.league_id, { season, name: lg.name })
    }
  }

  const consumed = new Set<string>()
  const families: DiscoveredFamily[] = []
  for (const [leagueId, meta] of [...newest.entries()].sort((a, b) => b[1].season - a[1].season)) {
    if (consumed.has(leagueId)) continue
    const { entries } = await walkLeagueChain(client, leagueId)
    for (const e of entries) consumed.add(e.leagueId)
    const yrs = entries.map((e) => e.season).filter((n) => Number.isFinite(n))
    const t = Number((entries.at(-1)?.league.settings as Record<string, unknown> | undefined)?.type)
    families.push({
      currentLeagueId: leagueId,
      name: meta.name,
      latestSeason: meta.season,
      seasonsAvailable: entries.length,
      seasonRange: yrs.length ? [Math.min(...yrs), Math.max(...yrs)] : null,
      type: t === 2 ? 'dynasty' : t === 1 ? 'keeper' : 'redraft',
    })
  }

  families.sort((a, b) => b.latestSeason - a.latestSeason || a.name.localeCompare(b.name))
  return families
}
