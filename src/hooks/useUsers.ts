import { useQuery } from '@tanstack/react-query'
import { fetchUsers } from '@/api/sleeper'
import { useLeagueSlug } from '@/context/LeagueScope'

export function useUsers() {
  const slug = useLeagueSlug()
  return useQuery({
    queryKey: ['lg', slug, 'users'],
    queryFn: () => fetchUsers(slug),
    staleTime: 30 * 60 * 1000,
  })
}
