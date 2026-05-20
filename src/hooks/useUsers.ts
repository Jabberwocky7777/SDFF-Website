import { useQuery } from '@tanstack/react-query'
import { fetchUsers } from '@/api/sleeper'

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
    staleTime: 30 * 60 * 1000,
  })
}
