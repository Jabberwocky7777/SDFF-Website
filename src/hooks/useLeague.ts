import { useQuery } from '@tanstack/react-query'
import { fetchLeague } from '@/api/sleeper'

export function useLeague() {
  return useQuery({
    queryKey: ['league'],
    queryFn: fetchLeague,
    staleTime: 30 * 60 * 1000,
  })
}
