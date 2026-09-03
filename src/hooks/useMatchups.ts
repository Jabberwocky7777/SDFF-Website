import { useQuery } from '@tanstack/react-query'
import { fetchMatchups } from '@/api/sleeper'
import { useLeagueSlug } from '@/context/LeagueScope'

export function useMatchups(week: number) {
  const slug = useLeagueSlug()
  return useQuery({
    queryKey: ['lg', slug, 'matchups', week],
    queryFn: () => fetchMatchups(slug, week),
    staleTime: 5 * 60 * 1000,
    enabled: week > 0,
  })
}
