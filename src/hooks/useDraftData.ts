import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { usePlayers } from '@/hooks/usePlayers'
import { parseFlockCsv, normalizePlayerName } from '@/lib/parseFlockCsv'
import { apiFetch, AUTH_KEY, ApiError } from '@/api/client'
import { API_BASE } from '@/config'
import type { Position } from '@/lib/parseFlockCsv'
import type { SleeperDraftPick } from '@/hooks/useDraftPicks'

// ── Types ─────────────────────────────────────────────────────────────────────

export type DynastyProfile = 'rebuild' | 'balanced' | 'allin'

export interface EnrichedPlayer {
  name: string
  playerId: string | null
  team: string
  position: Position
  flockRank: number
  sleeperSearchRank: number
  mockAdp: number | null
  currentPickNo: number
  available: boolean
  wentAt: number | null
  draftedByRosterId: number | null
  flockValue: number
  mockAdpValue: number | null
  dynastyProfile: DynastyProfile | null
  tier: string | null
}

interface SleeperDraftMeta {
  draft_id: string
  status: string
  type: string
  settings: {
    teams: number
    rounds: number
  }
  league_id: string
}

// ── Dynasty profile helper ────────────────────────────────────────────────────

function computeDynastyProfile(pos: Position, age: number | null): DynastyProfile | null {
  if (age == null) return null
  switch (pos) {
    case 'QB': return age < 24 ? 'rebuild' : age <= 29 ? 'balanced' : 'allin'
    case 'RB': return age < 22 ? 'rebuild' : age <= 26 ? 'balanced' : 'allin'
    case 'WR': return age < 23 ? 'rebuild' : age <= 27 ? 'balanced' : 'allin'
    case 'TE': return age < 24 ? 'rebuild' : age <= 28 ? 'balanced' : 'allin'
  }
}

// ── Text fetch helper ─────────────────────────────────────────────────────────

async function apiTextFetch(path: string): Promise<string> {
  const url = `${API_BASE}${path}`
  const password = sessionStorage.getItem(AUTH_KEY)

  const headers: Record<string, string> = { Accept: 'text/plain' }
  if (password) {
    headers['Authorization'] = 'Basic ' + btoa(`sdff:${password}`)
  }

  const res = await fetch(url, { headers })

  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('sdff:auth-failure'))
    throw new ApiError(401, 'Unauthorized')
  }
  if (!res.ok) {
    throw new ApiError(res.status, `API error ${res.status} for ${url}`)
  }

  return res.text()
}

// ── Hook ──────────────────────────────────────────────────────────────────────

interface UseDraftDataOptions {
  liveDraftId: string
  mockDraftId?: string
  pollIntervalMs?: number
}

export function useDraftData({
  liveDraftId,
  mockDraftId,
  pollIntervalMs = 30_000,
}: UseDraftDataOptions) {
  const queryClient = useQueryClient()

  // Sleeper player map (24h, shared with rest of app)
  const { data: playersMap } = usePlayers()

  // Flock rankings CSV (60s stale)
  const flockQuery = useQuery({
    queryKey: ['flock-rankings'],
    queryFn: () => apiTextFetch('/flock-rankings'),
    staleTime: 60_000,
  })

  // Mock draft picks for ADP baseline
  const mockPicksQuery = useQuery({
    queryKey: ['draft', mockDraftId, 'picks'],
    queryFn: () => apiFetch<SleeperDraftPick[]>(`/draft/${mockDraftId}/picks`),
    staleTime: 5 * 60_000,
    enabled: !!mockDraftId,
  })

  // Live draft metadata (status, settings.teams/rounds)
  const liveMetaQuery = useQuery({
    queryKey: ['draft', liveDraftId, 'meta'],
    queryFn: () => apiFetch<SleeperDraftMeta>(`/draft/${liveDraftId}`),
    staleTime: 30_000,
    refetchInterval: pollIntervalMs,
    enabled: !!liveDraftId,
  })

  // Live draft picks (15s TTL — matches server cache so manual refresh always gets fresh data)
  const livePicksQuery = useQuery({
    queryKey: ['draft', liveDraftId, 'picks'],
    queryFn: () => apiFetch<SleeperDraftPick[]>(`/draft/${liveDraftId}/picks`),
    staleTime: 15_000,
    refetchInterval: pollIntervalMs,
    enabled: !!liveDraftId,
  })

  // ── Reconciliation ──────────────────────────────────────────────────────────

  const players = useMemo<EnrichedPlayer[]>(() => {
    if (!flockQuery.data) return []

    // Parse Flock CSV — silently return empty on parse error
    let flockPlayers
    try {
      flockPlayers = parseFlockCsv(flockQuery.data)
    } catch {
      return []
    }

    const livePicks = livePicksQuery.data ?? []
    const mockPicks = mockPicksQuery.data ?? []
    const currentPickNo = livePicks.length + 1

    // Build Sleeper lookup maps
    const nameToId = new Map<string, string>()
    const nameTeamToId = new Map<string, string>()
    if (playersMap) {
      for (const [id, p] of Object.entries(playersMap)) {
        if (!['QB', 'RB', 'WR', 'TE'].includes(p.position)) continue
        const normName = normalizePlayerName(`${p.first_name} ${p.last_name}`)
        nameToId.set(normName, id)
        if (p.team) {
          nameTeamToId.set(`${normName}_${p.team.toLowerCase()}`, id)
        }
      }
    }

    // Build mock ADP map: playerId → pick_no
    const mockAdpMap = new Map<string, number>()
    for (const pick of mockPicks) {
      mockAdpMap.set(pick.player_id, pick.pick_no)
    }

    // Build drafted set + wentAt + rosterIdBy maps
    const draftedSet = new Set<string>()
    const wentAtMap = new Map<string, number>()
    const rosterIdMap = new Map<string, number>()
    for (const pick of livePicks) {
      draftedSet.add(pick.player_id)
      wentAtMap.set(pick.player_id, pick.pick_no)
      rosterIdMap.set(pick.player_id, pick.roster_id)
    }

    return flockPlayers.map((fp) => {
      // Match Flock player to Sleeper player ID
      const normName = normalizePlayerName(fp.name)
      const normTeam = fp.team.toLowerCase()
      const playerId =
        nameTeamToId.get(`${normName}_${normTeam}`) ??
        nameToId.get(normName) ??
        null

      const available = playerId != null ? !draftedSet.has(playerId) : true
      const wentAt = playerId != null ? (wentAtMap.get(playerId) ?? null) : null
      const draftedByRosterId = playerId != null ? (rosterIdMap.get(playerId) ?? null) : null
      const mockAdp = playerId != null ? (mockAdpMap.get(playerId) ?? null) : null
      const sleeperPlayer = playerId != null ? playersMap?.[playerId] : null
      const sleeperSearchRank = sleeperPlayer?.search_rank ?? 9999
      const age = sleeperPlayer?.age ?? null

      const round2 = (n: number) => Math.round(n * 100) / 100

      return {
        name: fp.name,
        playerId,
        team: fp.team,
        position: fp.position,
        flockRank: fp.expertRank,
        sleeperSearchRank,
        mockAdp,
        currentPickNo,
        available,
        wentAt,
        draftedByRosterId,
        flockValue: round2(currentPickNo - fp.expertRank),
        mockAdpValue: mockAdp != null ? round2(currentPickNo - mockAdp) : null,
        dynastyProfile: computeDynastyProfile(fp.position, age),
        tier: fp.tier,
      }
    })
  }, [flockQuery.data, livePicksQuery.data, mockPicksQuery.data, playersMap])

  const livePicks = livePicksQuery.data ?? []
  const currentPickNo = livePicks.length + 1
  const draftMeta = liveMetaQuery.data
  const totalPicks = draftMeta
    ? (draftMeta.settings.teams * draftMeta.settings.rounds)
    : 336

  // Last 8 picks, newest first
  const recentPicks = useMemo<SleeperDraftPick[]>(() => {
    return [...livePicks].sort((a, b) => b.pick_no - a.pick_no).slice(0, 8)
  }, [livePicks])

  const isLoading =
    flockQuery.isLoading ||
    (!!liveDraftId && (liveMetaQuery.isLoading || livePicksQuery.isLoading))

  const error =
    flockQuery.error instanceof Error ? flockQuery.error.message :
    livePicksQuery.error instanceof Error ? livePicksQuery.error.message :
    null

  function refresh() {
    if (!liveDraftId) return
    void queryClient.invalidateQueries({ queryKey: ['draft', liveDraftId] })
  }

  function reloadFlockRankings() {
    void queryClient.invalidateQueries({ queryKey: ['flock-rankings'] })
  }

  return {
    players,
    recentPicks,
    currentPickNo,
    draftStatus: draftMeta?.status ?? null,
    totalPicks,
    lastRefresh: livePicksQuery.dataUpdatedAt,
    isLoading,
    error,
    refresh,
    reloadFlockRankings,
  }
}
