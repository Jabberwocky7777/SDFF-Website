import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { useLeagueSlug } from '@/context/LeagueScope'

export function useDraftId() {
  const slug = useLeagueSlug()
  return useQuery<{ draftId: string | null }>({
    queryKey: ['lg', slug, 'draft-id'],
    queryFn: () => apiFetch<{ draftId: string | null }>(`/leagues/${slug}/live/draft-id`),
    staleTime: 30 * 60 * 1000,
  })
}
