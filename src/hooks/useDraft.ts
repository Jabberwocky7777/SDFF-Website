import { useQuery } from '@tanstack/react-query'
import { fetchDraftInfo, fetchKTCRankings, fetchSleeperProjections } from '@/api/draft'
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

export function useSleeperProjections(season: number, week: number) {
  return useQuery({
    queryKey: ['projections', season, week],
    queryFn: () => fetchSleeperProjections(season, week),
    staleTime: 6 * 60 * 60_000,
  })
}
