import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { useLeagueSlug } from '@/context/LeagueScope'
import type { TradedPick } from '@/types/picks'

export function useTradedPicks() {
  const slug = useLeagueSlug()
  return useQuery<TradedPick[]>({
    queryKey: ['lg', slug, 'traded-picks'],
    queryFn: () => apiFetch<TradedPick[]>(`/leagues/${slug}/live/traded-picks`),
    staleTime: 5 * 60 * 1000,
  })
}
