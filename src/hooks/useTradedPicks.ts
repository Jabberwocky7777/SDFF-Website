import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import type { TradedPick } from '@/types/picks'

export function useTradedPicks() {
  return useQuery<TradedPick[]>({
    queryKey: ['traded-picks'],
    queryFn: () => apiFetch<TradedPick[]>('/league/traded-picks'),
    staleTime: 5 * 60 * 1000,
  })
}
