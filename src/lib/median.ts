import type { SleeperMatchup } from '@/types/sleeper'

export function computeWeeklyMedian(matchups: SleeperMatchup[]): number {
  if (matchups.length === 0) return 0
  const scores = matchups.map((m) => m.points).sort((a, b) => a - b)
  const mid = Math.floor(scores.length / 2)
  if (scores.length % 2 === 1) return scores[mid]
  return (scores[mid - 1] + scores[mid]) / 2
}
