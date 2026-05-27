import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import type { FantasyCalcResponse } from '@/types/rankings'

export function useRankings() {
  return useQuery<FantasyCalcResponse>({
    queryKey: ['rankings'],
    queryFn: () => apiFetch<FantasyCalcResponse>('/rankings'),
    staleTime: 6 * 60 * 60 * 1000,
    gcTime: 8 * 60 * 60 * 1000,
  })
}
