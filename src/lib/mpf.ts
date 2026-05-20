import type { SleeperRoster } from '@/types/sleeper'

export function getMpf(roster: SleeperRoster): number {
  const max = roster.settings.max_points ?? 0
  const dec = roster.settings.max_points_decimal ?? 0
  return max + dec / 100
}
