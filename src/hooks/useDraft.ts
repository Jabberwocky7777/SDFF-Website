import { useQuery } from '@tanstack/react-query'
import { fetchDraftInfo, fetchKTCRankings, fetchSleeperStats } from '@/api/draft'
import type { SleeperDraftInfo } from '@/api/draft'

export function useDraftInfo(draftId: string | null | undefined) {
  return useQuery<SleeperDraftInfo>({
    queryKey: ['draft-info', draftId],
    queryFn: () => fetchDraftInfo(draftId!),
    staleTime: 5 * 60_000,
    enabled: !!draftId,
  })
}

export function useKTCRankings() {
  return useQuery({
    queryKey: ['ktc-rankings-superflex'],
    queryFn: fetchKTCRankings,
    staleTime: 24 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
  })
}

export function useSleeperStats(season: number) {
  return useQuery({
    queryKey: ['stats', season],
    queryFn: () => fetchSleeperStats(season),
    staleTime: 24 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
  })
}
