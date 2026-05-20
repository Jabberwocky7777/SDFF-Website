import { useQuery } from '@tanstack/react-query'
import { fetchNflState } from '@/api/sleeper'

export function useNflState() {
  return useQuery({
    queryKey: ['nflState'],
    queryFn: fetchNflState,
    staleTime: 30 * 60 * 1000,
  })
}
