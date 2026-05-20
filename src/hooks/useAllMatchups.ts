import { useQueries } from '@tanstack/react-query'
import { fetchMatchups } from '@/api/sleeper'
import { REGULAR_SEASON_WEEKS } from '@/config'
import type { SleeperMatchup } from '@/types/sleeper'

export function useAllMatchups(currentWeek: number) {
  const weeks = Array.from(
    { length: Math.min(currentWeek, REGULAR_SEASON_WEEKS) },
    (_, i) => i + 1,
  )

  const results = useQueries({
    queries: weeks.map((week) => ({
      queryKey: ['matchups', week],
      queryFn: () => fetchMatchups(week),
      staleTime: 30 * 60 * 1000,
      enabled: week > 0,
    })),
  })

  const isLoading = results.some((r) => r.isLoading)
  const isError = results.some((r) => r.isError)
  const allMatchups: SleeperMatchup[][] = results
    .map((r) => r.data)
    .filter((d): d is SleeperMatchup[] => d != null)

  return { allMatchups, isLoading, isError }
}
