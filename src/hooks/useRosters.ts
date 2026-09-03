import { useQuery } from '@tanstack/react-query'
import { fetchRosters } from '@/api/sleeper'
import { useLeagueSlug } from '@/context/LeagueScope'

export function useRosters() {
  const slug = useLeagueSlug()
  return useQuery({
    queryKey: ['lg', slug, 'rosters'],
    queryFn: () => fetchRosters(slug),
    staleTime: 30 * 60 * 1000,
  })
}
