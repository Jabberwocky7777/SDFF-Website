import { apiFetch, adminFetch } from '@/api/client'

export interface Announcement {
  id: string
  title: string
  body: string
  createdAt: string
  pinned?: boolean
}

export function fetchAnnouncements(): Promise<Announcement[]> {
  return apiFetch('/announcements')
}

export function createAnnouncement(data: { title: string; body: string; pinned: boolean }): Promise<Announcement> {
  return adminFetch('/announcements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function deleteAnnouncement(id: string): Promise<{ ok: boolean }> {
  return adminFetch(`/announcements/${id}`, { method: 'DELETE' })
}

export function togglePin(id: string): Promise<Announcement> {
  return adminFetch(`/announcements/${id}/pin`, { method: 'PATCH' })
}
