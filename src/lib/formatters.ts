import { SLEEPER_CDN } from '@/config'

export function fmtPts(n: number): string {
  return n.toFixed(2)
}

export function fmtRecord(w: number, l: number, t = 0): string {
  return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`
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
