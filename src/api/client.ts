import { API_BASE } from '@/config'

export const AUTH_KEY = 'sdff_password'
export const ADMIN_KEY = 'sdff_admin_key'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

function buildAuthHeader(password: string): string {
  return 'Basic ' + btoa(`sdff:${password}`)
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`
  const password = sessionStorage.getItem(AUTH_KEY)

  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  }
  if (password) {
    headers['Authorization'] = buildAuthHeader(password)
  }

  const res = await fetch(url, { ...init, headers })

  if (res.status === 401) {
    // Signal the auth context to show the splash screen
    window.dispatchEvent(new CustomEvent('sdff:auth-failure'))
    throw new ApiError(401, 'Unauthorized')
  }

  if (!res.ok) {
    throw new ApiError(res.status, `API error ${res.status} for ${url}`)
  }

  return res.json() as Promise<T>
}

export async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`
  const password = sessionStorage.getItem(AUTH_KEY)
  const adminKey = sessionStorage.getItem(ADMIN_KEY)

  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  }
  if (password) headers['Authorization'] = buildAuthHeader(password)
  if (adminKey) headers['X-Admin-Key'] = adminKey

  const res = await fetch(url, { ...init, headers })

  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('sdff:auth-failure'))
    throw new ApiError(401, 'Unauthorized')
  }

  if (!res.ok) {
    throw new ApiError(res.status, `API error ${res.status} for ${url}`)
  }

  return res.json() as Promise<T>
}
