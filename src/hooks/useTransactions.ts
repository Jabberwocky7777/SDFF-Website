import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import type { SleeperTransaction } from '@/types/transactions'

export function useTransactions(week: number) {
  return useQuery<SleeperTransaction[]>({
    queryKey: ['transactions', week],
    queryFn: () => apiFetch<SleeperTransaction[]>(`/league/transactions/${week}`),
    staleTime: 2 * 60 * 1000,
    enabled: week > 0,
  })
}
