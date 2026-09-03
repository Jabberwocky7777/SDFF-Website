import { useQuery } from '@tanstack/react-query'
import { fetchLeague } from '@/api/sleeper'
import { useLeagueSlug } from '@/context/LeagueScope'

export function useLeague() {
  const slug = useLeagueSlug()
  return useQuery({
    queryKey: ['lg', slug, 'league'],
    queryFn: () => fetchLeague(slug),
    staleTime: 30 * 60 * 1000,
  })
}
