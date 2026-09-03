import { SLEEPER_CDN } from '@/config'

export function fmtPts(n: number): string {
  return n.toFixed(2)
}

export function fmtRecord(w: number, l: number, t = 0): string {
  return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`
}

export function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

/** Signed for deltas: +1.2 / -1.2, so a gain reads as one at a glance. */
export function fmtSigned(n: number, digits = 1): string {
  const v = n.toFixed(digits)
  return n > 0 ? `+${v}` : v
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

export function avatarUrl(avatarId: string | null | undefined): string | null {
  if (!avatarId) return null
  return `${SLEEPER_CDN}/${avatarId}`
}

export function getTeamName(
  userId: string,
  users: { user_id: string; display_name: string; metadata?: { team_name?: string } }[],
): string {
  const user = users.find((u) => u.user_id === userId)
  if (!user) return 'Unknown Team'
  return user.metadata?.team_name || user.display_name
}

export function getAvatar(
  userId: string,
  users: { user_id: string; avatar: string | null }[],
): string | null {
  const user = users.find((u) => u.user_id === userId)
  return avatarUrl(user?.avatar)
}
