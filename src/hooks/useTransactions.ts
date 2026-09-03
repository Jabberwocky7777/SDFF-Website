import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { useLeagueSlug } from '@/context/LeagueScope'
import type { SleeperTransaction } from '@/types/transactions'

export function useTransactions(week: number) {
  const slug = useLeagueSlug()
  return useQuery<SleeperTransaction[]>({
    queryKey: ['lg', slug, 'transactions', week],
    queryFn: () =>
      apiFetch<SleeperTransaction[]>(`/leagues/${slug}/live/transactions/${week}`),
    staleTime: 2 * 60 * 1000,
    enabled: week > 0,
  })
}
