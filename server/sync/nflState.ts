/**
 * Resolve "what week is it" — drives every sync (PLAN.md §1 GET /state/nfl).
 * Falls back to a sane default if Sleeper is unreachable.
 */
import type { SleeperClient } from '../sleeper/client.js'

export interface ResolvedNflState {
  season: number
  week: number
  seasonType: string
}

export async function resolveNflState(client: SleeperClient): Promise<ResolvedNflState> {
  const state = await client.getNflState()
  if (state) {
    return {
      season: Number(state.season) || new Date().getFullYear(),
      week: Number(state.week) || 1,
      seasonType: state.season_type ?? 'regular',
    }
  }
  return { season: new Date().getFullYear(), week: 1, seasonType: 'regular' }
}
