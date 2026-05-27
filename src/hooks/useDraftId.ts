import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'

export function useDraftId() {
  return useQuery<{ draftId: string | null }>({
    queryKey: ['draft-id'],
    queryFn: () => apiFetch<{ draftId: string | null }>('/league/draft-id'),
    staleTime: 30 * 60 * 1000,
  })
}
