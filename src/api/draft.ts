import { apiFetch } from './client'
import type { SleeperDraftPick } from '@/hooks/useDraftPicks'
import type { KTCPlayer, SleeperProjection } from '@/lib/draftGrades'

export interface SleeperDraftInfo {
  draft_id: string
  type: string
  status: 'pre_draft' | 'drafting' | 'complete'
  name: string | null
  settings: {
    rounds: number
    teams: number
    [key: string]: unknown
  }
  season: string
  metadata?: Record<string, string>
}

const live = (slug: string) => `/leagues/${slug}/live`

export const fetchDraftInfo = (slug: string, draftId: string) =>
  apiFetch<SleeperDraftInfo>(`${live(slug)}/draft/${draftId}`)

export const fetchDraftPicks = (slug: string, draftId: string) =>
  apiFetch<SleeperDraftPick[]>(`${live(slug)}/draft/${draftId}/picks`)

export const fetchKTCRankings = (slug: string) =>
  apiFetch<KTCPlayer[]>(`${live(slug)}/ktc/rankings`)

export const fetchSleeperStats = (slug: string, season: number) =>
  apiFetch<Record<string, SleeperProjection>>(`${live(slug)}/stats/${season}`)
