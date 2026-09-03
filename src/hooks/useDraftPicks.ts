import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { useLeagueSlug } from '@/context/LeagueScope'

export interface SleeperDraftPick {
  round: number
  roster_id: number      // league roster ID (0 in mock drafts — use draft_slot instead)
  draft_slot: number     // pick order in the draft (1–N); reliable in both live and mock drafts
  player_id: string
  picked_by: string      // roster_id of the team that made the pick
  pick_no: number
  metadata: {
    first_name: string
    last_name: string
    position: string
    team: string
    injury_status?: string
  }
}

export function useDraftPicks(draftId: string | null | undefined) {
  const slug = useLeagueSlug()
  return useQuery<SleeperDraftPick[]>({
    queryKey: ['lg', slug, 'draft', draftId, 'picks'],
    queryFn: () =>
      apiFetch<SleeperDraftPick[]>(`/leagues/${slug}/live/draft/${draftId}/picks`),
    staleTime: 30 * 1000,
    enabled: !!draftId,
    refetchInterval: 30 * 1000,
  })
}
