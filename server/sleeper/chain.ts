/**
 * The `previous_league_id` chain walker.
 *
 * Sleeper has no "give me league history" endpoint. Each season's league object
 * points backward to the prior season via `previous_league_id`. Walking that
 * chain from the current league ID until null IS the league's history, and
 * every sync depends on it.
 */
import type { SleeperClient } from './client.js'
import type { SleeperLeague } from './schemas.js'

export interface LeagueChainEntry {
  leagueId: string
  season: number
  name: string
  status: string | null
  previousLeagueId: string | null
  totalRosters: number | null
  league: SleeperLeague
}

export interface WalkChainResult {
  /** Oldest season first. */
  entries: LeagueChainEntry[]
  /** IDs that were requested but returned nothing (folded/deleted leagues). */
  missing: string[]
}

const MAX_DEPTH = 40 // ~40 seasons; a guard against a cyclic chain

export async function walkLeagueChain(
  client: SleeperClient,
  currentLeagueId: string,
): Promise<WalkChainResult> {
  const entries: LeagueChainEntry[] = []
  const missing: string[] = []
  const seen = new Set<string>()

  let id: string | null = currentLeagueId
  let depth = 0

  while (id && depth < MAX_DEPTH) {
    if (seen.has(id)) {
      console.warn(`[chain] cycle detected at league ${id} — stopping walk`)
      break
    }
    seen.add(id)
    depth++

    const league: SleeperLeague | null = await client.getLeague(id)
    if (!league) {
      missing.push(id)
      break
    }

    const previousLeagueId = league.previous_league_id ?? null
    entries.push({
      leagueId: league.league_id,
      season: Number(league.season),
      name: league.name,
      status: league.status ?? null,
      previousLeagueId,
      totalRosters: league.total_rosters ?? null,
      league,
    })

    id = previousLeagueId
  }

  if (depth >= MAX_DEPTH) {
    console.warn(`[chain] hit MAX_DEPTH (${MAX_DEPTH}) walking from ${currentLeagueId}`)
  }

  entries.reverse() // oldest season first
  return { entries, missing }
}
