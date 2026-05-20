import { apiFetch } from './client'
import type {
  SleeperLeague,
  SleeperUser,
  SleeperRoster,
  SleeperMatchup,
  SleeperNflState,
  SleeperPlayersMap,
} from '@/types/sleeper'

export const fetchLeague = () => apiFetch<SleeperLeague>('/league')
export const fetchUsers = () => apiFetch<SleeperUser[]>('/users')
export const fetchRosters = () => apiFetch<SleeperRoster[]>('/rosters')
export const fetchMatchups = (week: number) => apiFetch<SleeperMatchup[]>(`/matchups/${week}`)
export const fetchNflState = () => apiFetch<SleeperNflState>('/state')
export const fetchPlayers = () => apiFetch<SleeperPlayersMap>('/players')
