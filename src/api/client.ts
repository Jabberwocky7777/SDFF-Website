import { API_BASE } from '@/config'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export async function apiFetch<T>(path: string): Promise<T> {
  const url = `${API_BASE}${path}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new ApiError(res.status, `API error ${res.status} for ${url}`)
  }
  return res.json() as Promise<T>
}
