import { useQuery } from '@tanstack/react-query'
import { fetchRosters } from '@/api/sleeper'

export function useRosters() {
  return useQuery({
    queryKey: ['rosters'],
    queryFn: fetchRosters,
    staleTime: 30 * 60 * 1000,
  })
}
