import { useQuery } from '@tanstack/react-query'
import { fetchNflState } from '@/api/sleeper'
import { useLeagueSlug } from '@/context/LeagueScope'

export function useNflState() {
  const slug = useLeagueSlug()
  return useQuery({
    queryKey: ['nflState'],
    queryFn: () => fetchNflState(slug),
    staleTime: 30 * 60 * 1000,
  })
}
