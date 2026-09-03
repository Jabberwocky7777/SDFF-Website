import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { parseFlockCsv, normalizePlayerName } from '@/lib/parseFlockCsv'
import { apiFetch, ApiError } from '@/api/client'
import { API_BASE } from '@/config'
import type { Position } from '@/lib/parseFlockCsv'
import type { SleeperDraftPick } from '@/hooks/useDraftPicks'
import type { SleeperPlayersMap } from '@/types/sleeper'

// ── Types ─────────────────────────────────────────────────────────────────────

export type DynastyProfile = 'rebuild' | 'balanced' | 'allin'

export interface EnrichedPlayer {
  name: string
  playerId: string | null
  team: string
  position: Position
  flockRank: number
  sleeperSearchRank: number
  currentPickNo: number
  available: boolean
  wentAt: number | null
  draftedByRosterId: number | null
  flockValue: number
  ktcRank: number | null
  ktcValue: number | null
  ktcValueDelta: number | null
  fcRank: number | null
  fcValue: number | null
  fcValueDelta: number | null
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

interface KtcPlayer {
  playerName: string
  position: string
  team?: string
  value: number
  overallRank: number
}

interface FcEntry {
  player: { name: string; position: string; team?: string }
  value: number
  overallRank: number
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
  const res = await fetch(url, {
    credentials: 'include',
    headers: { Accept: 'text/plain' },
  })

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

/** How often live pick data is re-fetched. The board's countdown reads this too. */
export const DEFAULT_POLL_INTERVAL_MS = 30_000

interface UseDraftDataOptions {
  liveDraftId: string
  pollIntervalMs?: number
}

export function useDraftData({
  liveDraftId,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: UseDraftDataOptions) {
  const queryClient = useQueryClient()

  // Sleeper player map (24h) — via the admin draft tool, not league-scoped.
  const { data: playersMap } = useQuery({
    queryKey: ['draft-tool', 'players'],
    queryFn: () => apiFetch<SleeperPlayersMap>('/draft-tool/players'),
    staleTime: 24 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
  })

  // Flock rankings CSV (60s stale)
  const flockQuery = useQuery({
    queryKey: ['flock-rankings'],
    queryFn: () => apiTextFetch('/draft-tool/flock-rankings'),
    staleTime: 60_000,
  })

  // KTC dynasty rankings (1h stale)
  const ktcQuery = useQuery({
    queryKey: ['ktc-rankings'],
    queryFn: () => apiFetch<KtcPlayer[]>('/draft-tool/ktc-rankings'),
    staleTime: 60 * 60_000,
  })

  // FantasyCalc dynasty rankings (1h stale)
  const fcQuery = useQuery({
    queryKey: ['fantasycalc-rankings'],
    queryFn: () => apiFetch<FcEntry[]>('/draft-tool/fantasycalc-rankings'),
    staleTime: 60 * 60_000,
  })

  // Live draft metadata (status, settings.teams/rounds)
  const liveMetaQuery = useQuery({
    queryKey: ['draft', liveDraftId, 'meta'],
    queryFn: () => apiFetch<SleeperDraftMeta>(`/draft-tool/draft/${liveDraftId}`),
    staleTime: 30_000,
    refetchInterval: pollIntervalMs,
    enabled: !!liveDraftId,
  })

  // Live draft picks (15s TTL — matches server cache so manual refresh always gets fresh data)
  const livePicksQuery = useQuery({
    queryKey: ['draft', liveDraftId, 'picks'],
    queryFn: () => apiFetch<SleeperDraftPick[]>(`/draft-tool/draft/${liveDraftId}/picks`),
    staleTime: 15_000,
    refetchInterval: pollIntervalMs,
    enabled: !!liveDraftId,
  })

  // ── Reconciliation ──────────────────────────────────────────────────────────

  const players = useMemo<EnrichedPlayer[]>(() => {
    if (!flockQuery.data) return []

    let flockPlayers
    try {
      flockPlayers = parseFlockCsv(flockQuery.data)
    } catch {
      return []
    }

    const livePicks = livePicksQuery.data ?? []
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

    // Build KTC lookup map: normalizedName → { rank, value }
    const ktcMap = new Map<string, { rank: number; value: number }>()
    for (const p of (ktcQuery.data ?? [])) {
      ktcMap.set(normalizePlayerName(p.playerName), { rank: p.overallRank, value: p.value })
    }

    // Build FantasyCalc lookup map: normalizedName → { rank, value }
    const fcMap = new Map<string, { rank: number; value: number }>()
    for (const entry of (fcQuery.data ?? [])) {
      if (!['QB', 'RB', 'WR', 'TE'].includes(entry.player.position)) continue
      fcMap.set(normalizePlayerName(entry.player.name), { rank: entry.overallRank, value: entry.value })
    }

    // Build drafted set + wentAt + draftSlot maps
    const draftedSet = new Set<string>()
    const wentAtMap = new Map<string, number>()
    const rosterIdMap = new Map<string, number>()
    for (const pick of livePicks) {
      draftedSet.add(pick.player_id)
      wentAtMap.set(pick.player_id, pick.pick_no)
      rosterIdMap.set(pick.player_id, pick.draft_slot)
    }

    const round2 = (n: number) => Math.round(n * 100) / 100

    return flockPlayers.map((fp) => {
      const normName = normalizePlayerName(fp.name)
      const normTeam = fp.team.toLowerCase()
      const playerId =
        nameTeamToId.get(`${normName}_${normTeam}`) ??
        nameToId.get(normName) ??
        null

      const available = playerId != null ? !draftedSet.has(playerId) : true
      const wentAt = playerId != null ? (wentAtMap.get(playerId) ?? null) : null
      const draftedByRosterId = playerId != null ? (rosterIdMap.get(playerId) ?? null) : null
      const sleeperPlayer = playerId != null ? playersMap?.[playerId] : null
      const sleeperSearchRank = sleeperPlayer?.search_rank ?? 9999
      const age = sleeperPlayer?.age ?? null

      const ktcEntry = ktcMap.get(normName) ?? null
      const fcEntry  = fcMap.get(normName) ?? null

      return {
        name: fp.name,
        playerId,
        team: fp.team,
        position: fp.position,
        flockRank: fp.expertRank,
        sleeperSearchRank,
        currentPickNo,
        available,
        wentAt,
        draftedByRosterId,
        flockValue:    round2(currentPickNo - fp.expertRank),
        ktcRank:       ktcEntry?.rank  ?? null,
        ktcValue:      ktcEntry?.value ?? null,
        ktcValueDelta: ktcEntry ? round2(currentPickNo - ktcEntry.rank) : null,
        fcRank:        fcEntry?.rank   ?? null,
        fcValue:       fcEntry?.value  ?? null,
        fcValueDelta:  fcEntry  ? round2(currentPickNo - fcEntry.rank)  : null,
        dynastyProfile: computeDynastyProfile(fp.position, age),
        tier: fp.tier,
      }
    })
  }, [flockQuery.data, livePicksQuery.data, ktcQuery.data, fcQuery.data, playersMap])

  // Memoised so the `?? []` fallback doesn't hand out a fresh array reference on
  // every render and defeat the recentPicks memo below.
  const livePicks = useMemo(() => livePicksQuery.data ?? [], [livePicksQuery.data])
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

  const isFetching =
    (!!liveDraftId && livePicksQuery.isFetching && !livePicksQuery.isLoading)

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
    isFetching,
    error,
    refresh,
    reloadFlockRankings,
  }
}
