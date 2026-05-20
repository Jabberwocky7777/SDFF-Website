import { useQuery } from '@tanstack/react-query'
import { fetchMatchups } from '@/api/sleeper'

export function useMatchups(week: number) {
  return useQuery({
    queryKey: ['matchups', week],
    queryFn: () => fetchMatchups(week),
    staleTime: 5 * 60 * 1000,
    enabled: week > 0,
  })
}
