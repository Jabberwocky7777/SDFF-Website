import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { useLeagueSlug } from '@/context/LeagueScope'
import type { FantasyCalcResponse } from '@/types/rankings'

export function useRankings() {
  const slug = useLeagueSlug()
  return useQuery<FantasyCalcResponse>({
    queryKey: ['rankings'],
    queryFn: () => apiFetch<FantasyCalcResponse>(`/leagues/${slug}/live/rankings`),
    staleTime: 6 * 60 * 60 * 1000,
    gcTime: 8 * 60 * 60 * 1000,
  })
}
