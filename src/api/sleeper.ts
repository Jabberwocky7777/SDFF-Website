import { apiFetch } from './client'
import type {
  SleeperLeague,
  SleeperUser,
  SleeperRoster,
  SleeperMatchup,
  SleeperNflState,
  SleeperPlayersMap,
} from '@/types/sleeper'

/** All live Sleeper data is proxied per-league through `/api/leagues/:slug/live/*`. */
const live = (slug: string) => `/leagues/${slug}/live`

export const fetchLeague = (slug: string) => apiFetch<SleeperLeague>(`${live(slug)}/league`)
export const fetchUsers = (slug: string) => apiFetch<SleeperUser[]>(`${live(slug)}/users`)
export const fetchRosters = (slug: string) => apiFetch<SleeperRoster[]>(`${live(slug)}/rosters`)
export const fetchMatchups = (slug: string, week: number) =>
  apiFetch<SleeperMatchup[]>(`${live(slug)}/matchups/${week}`)
export const fetchNflState = (slug: string) => apiFetch<SleeperNflState>(`${live(slug)}/state`)
export const fetchPlayers = (slug: string) => apiFetch<SleeperPlayersMap>(`${live(slug)}/players`)
