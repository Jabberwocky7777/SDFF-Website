/**
 * Client for the multi-league hub API (`/api/leagues/:slug/...` and
 * `/api/auth/*`). Auth is the `sdff_session` cookie set by the login flow —
 * sent automatically on same-origin requests, so no header wrangling here.
 */
import { API_BASE } from '@/config'
import { ApiError } from './client'

async function hubFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers as Record<string, string>) },
  })
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('sdff:auth-failure'))
    throw new ApiError(401, 'Unauthorized')
  }
  if (!res.ok) throw new ApiError(res.status, `API error ${res.status} for ${path}`)
  return res.json() as Promise<T>
}

// ── Auth & setup ────────────────────────────────────────────────────────────

export interface SessionInfo {
  authed: boolean
  slugs: string[]
  admin: boolean
  needsSetup: boolean
  hasLeagues: boolean
  flagshipSlug: string | null
}

export const getSession = () => hubFetch<SessionInfo>('/auth/session')

export const login = (code: string) =>
  hubFetch<SessionInfo & { error?: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })

export const logout = () => hubFetch<{ authed: false }>('/auth/logout', { method: 'POST' })

export const runSetup = (password: string) =>
  hubFetch<{ authed: boolean; admin: boolean }>('/setup', {
    method: 'POST',
    body: JSON.stringify({ password }),
  })

// ── Admin: leagues & settings ───────────────────────────────────────────────

export interface LeagueSyncStatus {
  slug: string
  syncing: boolean
  queued: boolean
  seasons: number
  matchups: number
  lastSync: { at: number | null; status: string | null; error: string | null }
}

export interface AdminLeague {
  slug: string
  displayName: string
  type: HubLeague['type']
  currentLeagueId: string
  accessCode: string
  themeAccent: string | null
  sortOrder: number
  addedAt: number | null
  sync: LeagueSyncStatus | null
}

export const getAdminLeagues = () => hubFetch<AdminLeague[]>('/admin/leagues')

export const suggestAccessCode = () =>
  hubFetch<{ code: string }>('/admin/leagues/suggest-code')

export interface DiscoveredLeague {
  currentLeagueId: string
  name: string
  latestSeason: number
  seasonsAvailable: number
  seasonRange: [number, number] | null
  type: 'dynasty' | 'keeper' | 'redraft'
  alreadyAdded: boolean
}

export const discoverLeagues = (username?: string) =>
  hubFetch<DiscoveredLeague[]>(
    `/admin/leagues/discover${username ? `?username=${encodeURIComponent(username)}` : ''}`,
  )

export const addLeague = (input: {
  currentLeagueId: string
  displayName?: string
  type?: HubLeague['type']
  accessCode?: string
  themeAccent?: string | null
}) => hubFetch<AdminLeague>('/admin/leagues', { method: 'POST', body: JSON.stringify(input) })

export const updateLeague = (
  slug: string,
  patch: Partial<{
    displayName: string
    type: HubLeague['type']
    accessCode: string
    currentLeagueId: string
    themeAccent: string | null
    sortOrder: number
  }>,
) => hubFetch<AdminLeague>(`/admin/leagues/${slug}`, { method: 'PATCH', body: JSON.stringify(patch) })

export const deleteLeague = (slug: string) =>
  hubFetch<{ ok: boolean }>(`/admin/leagues/${slug}`, { method: 'DELETE' })

export const resyncLeague = (slug: string, force = false) =>
  hubFetch<{ state: 'started' | 'queued'; sync: LeagueSyncStatus }>(
    `/admin/leagues/${slug}/resync`,
    { method: 'POST', body: JSON.stringify({ force }) },
  )

export const getAdminSettings = () => hubFetch<{ sleeperUsername: string }>('/admin/settings')

export const saveAdminSettings = (sleeperUsername: string) =>
  hubFetch<{ sleeperUsername: string }>('/admin/settings', {
    method: 'PUT',
    body: JSON.stringify({ sleeperUsername }),
  })

export const changeAdminPassword = (current: string, next: string) =>
  hubFetch<{ ok: boolean }>('/admin/password', {
    method: 'POST',
    body: JSON.stringify({ current, next }),
  })

// ── Leagues ─────────────────────────────────────────────────────────────────

export interface HubLeague {
  slug: string
  displayName: string
  type: 'dynasty' | 'redraft' | 'keeper' | 'bestball'
  sortOrder: number
  theme?: { accent: string }
}

export const getLeagues = () => hubFetch<HubLeague[]>('/leagues')

export interface LeagueCapabilities {
  seasonsAvailable: number
  hasHistory: boolean
  hasTradedPicks: boolean
  isSuperflex: boolean
  hasMedianScoring: boolean
  hasDivisions: boolean
  hasTaxiSquad: boolean
  playoffTeams: number
  playoffWeekStart: number
}

export interface SeasonSummary {
  leagueId: string
  season: number
  status: string | null
  totalRosters: number | null
  capabilities: LeagueCapabilities | null
  champion: { userId: string; name: string | null } | null
  runnerUp: { userId: string; name: string | null } | null
}

export interface LeagueMeta {
  slug: string
  displayName: string
  type: HubLeague['type']
  theme: { accent: string } | null
  ingested: boolean
  latestCapabilities: LeagueCapabilities | null
  seasons: SeasonSummary[]
}

export const getLeagueMeta = (slug: string) => hubFetch<LeagueMeta>(`/leagues/${slug}`)

// ── Analytics ───────────────────────────────────────────────────────────────

export interface StandingRow {
  userId: string
  name: string
  seasons: number
  wins: number
  losses: number
  ties: number
  winPct: number
  pointsFor: number
  pointsAgainst: number
  ppg: number
  medianWins: number
  medianLosses: number
  playoffAppearances: number
  championships: number
  runnerUps: number
  lastPlaceFinishes: number
  bestFinish: number | null
  regularSeasonWins: number
  playoffWins: number
}

export const getStandings = (slug: string, season?: number) =>
  hubFetch<StandingRow[]>(`/leagues/${slug}/standings${season ? `?season=${season}` : ''}`)

export const getHistory = (slug: string) => hubFetch<SeasonSummary[]>(`/leagues/${slug}/history`)

export interface TimelineData {
  seasons: number[]
  managers: Array<{ userId: string; name: string }>
  ranks: Record<string, Record<number, number | null>>
  champions: Record<number, string | null>
}

export const getTimeline = (slug: string) => hubFetch<TimelineData>(`/leagues/${slug}/timeline`)

export interface RecordEntry {
  label: string
  userId: string | null
  name: string | null
  value: number
  season: number | null
  week: number | null
  detail?: string
}

export const getRecords = (slug: string) => hubFetch<RecordEntry[]>(`/leagues/${slug}/records`)

export interface H2HCell {
  wins: number
  losses: number
  ties: number
  pointsFor: number
  pointsAgainst: number
  meetings: number
}

export interface H2HMatrix {
  managers: Array<{ userId: string; name: string }>
  cells: Record<string, Record<string, H2HCell>>
}

export const getH2HMatrix = (slug: string) => hubFetch<H2HMatrix>(`/leagues/${slug}/h2h`)

export interface H2HGame {
  season: number
  week: number
  points: number
  opponentPoints: number
  result: 'W' | 'L' | 'T'
  margin: number
  isPlayoff: boolean
  isConsolation: boolean
}

export interface H2HGameLog {
  a: string
  b: string
  aName: string
  bName: string
  record: { wins: number; losses: number; ties: number }
  games: H2HGame[]
}

export const getH2HGameLog = (slug: string, a: string, b: string) =>
  hubFetch<H2HGameLog>(`/leagues/${slug}/h2h/${a}/vs/${b}`)

export interface AllPlayRow {
  userId: string
  name: string
  weeks: number
  actualWins: number
  actualLosses: number
  allPlayWins: number
  allPlayLosses: number
  allPlayTies: number
  allPlayWinPct: number
  expectedWins: number
  scheduleLuck: number
  pointsAboveMedian: number
}

export const getAllPlay = (slug: string, season?: number) =>
  hubFetch<AllPlayRow[]>(`/leagues/${slug}/allplay${season ? `?season=${season}` : ''}`)

export interface PowerRow {
  rank: number
  previousRank: number | null
  movement: number | null
  userId: string
  name: string
  score: number
  recentPpg: number
  seasonPpg: number
  allPlayWinPct: number
  record: string
}

export interface PowerRankings {
  season: number | null
  throughWeek: number | null
  rankings: PowerRow[]
}

export const getPowerRankings = (slug: string, season?: number) =>
  hubFetch<PowerRankings>(`/leagues/${slug}/power-rankings${season ? `?season=${season}` : ''}`)

export const getManagers = (slug: string) => hubFetch<StandingRow[]>(`/leagues/${slug}/managers`)

export interface ManagerProfile {
  career: StandingRow
  seasons: SeasonSummary[]
  perSeason: Array<{ season: number; row: StandingRow }>
  nemesis: (H2HCell & { userId: string; name: string }) | null
  favorite: (H2HCell & { userId: string; name: string }) | null
}

export const getManagerProfile = (slug: string, userId: string) =>
  hubFetch<ManagerProfile>(`/leagues/${slug}/managers/${userId}`)
