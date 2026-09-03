import { useQuery } from '@tanstack/react-query'
import { fetchDraftInfo, fetchKTCRankings, fetchSleeperStats } from '@/api/draft'
import { useLeagueSlug } from '@/context/LeagueScope'
import type { SleeperDraftInfo } from '@/api/draft'

export function useDraftInfo(draftId: string | null | undefined) {
  const slug = useLeagueSlug()
  return useQuery<SleeperDraftInfo>({
    queryKey: ['lg', slug, 'draft', draftId, 'info'],
    queryFn: () => fetchDraftInfo(slug, draftId!),
    staleTime: 5 * 60_000,
    enabled: !!draftId,
  })
}

export function useKTCRankings() {
  const slug = useLeagueSlug()
  return useQuery({
    queryKey: ['ktc-rankings-superflex'],
    queryFn: () => fetchKTCRankings(slug),
    staleTime: 24 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
  })
}

export function useSleeperStats(season: number) {
  const slug = useLeagueSlug()
  return useQuery({
    queryKey: ['stats', season],
    queryFn: () => fetchSleeperStats(slug, season),
    staleTime: 24 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
  })
}
