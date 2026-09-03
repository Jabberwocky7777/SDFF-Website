import { useQuery } from '@tanstack/react-query'
import { fetchPlayers } from '@/api/sleeper'
import { useLeagueSlug } from '@/context/LeagueScope'

export function usePlayers() {
  const slug = useLeagueSlug()
  return useQuery({
    queryKey: ['players'],
    queryFn: () => fetchPlayers(slug),
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  })
}
