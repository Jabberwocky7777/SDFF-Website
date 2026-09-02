import { API_BASE } from '@/config'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/**
 * Fetch a JSON API route. Auth is the `sdff_session` cookie set by the login
 * flow — sent automatically on same-origin requests, so nothing to attach here.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { ...(init?.headers as Record<string, string>) },
  })

  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('sdff:auth-failure'))
    throw new ApiError(401, 'Unauthorized')
  }
  if (!res.ok) {
    throw new ApiError(res.status, `API error ${res.status} for ${API_BASE}${path}`)
  }
  return res.json() as Promise<T>
}

/**
 * Admin-only routes. Access is granted by logging in with the admin code
 * (the session carries an `admin` flag); this is just `apiFetch` today, kept
 * as a distinct name so admin call sites stay obvious.
 */
export const adminFetch = apiFetch
