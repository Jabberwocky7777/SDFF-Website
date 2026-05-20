import { useQuery } from '@tanstack/react-query'
import { fetchPlayers } from '@/api/sleeper'

export function usePlayers() {
  return useQuery({
    queryKey: ['players'],
    queryFn: fetchPlayers,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  })
}
