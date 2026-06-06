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

export const fetchDraftInfo = (draftId: string) =>
  apiFetch<SleeperDraftInfo>(`/draft/${draftId}`)

export const fetchDraftPicks = (draftId: string) =>
  apiFetch<SleeperDraftPick[]>(`/draft/${draftId}/picks`)

export const fetchKTCRankings = () =>
  apiFetch<KTCPlayer[]>('/ktc/rankings')

export const fetchSleeperStats = (season: number) =>
  apiFetch<Record<string, SleeperProjection>>(`/stats/${season}`)
