import { useMemo } from 'react'
import { useRosters } from '@/hooks/useRosters'
import { useUsers } from '@/hooks/useUsers'
import { useNflState } from '@/hooks/useNflState'
import { getTeamName } from '@/lib/formatters'
import { LEAGUE_CONFIG } from '@/data/leagueConfig'
import SkeletonLoader from '@/components/ui/SkeletonLoader'

const BUDGET = LEAGUE_CONFIG.faabBudget

export default function FaabTracker() {
  const { data: rosters, isLoading: lr } = useRosters()
  const { data: users, isLoading: lu } = useUsers()
  const { data: nflState } = useNflState()

  const poolLabel = (!nflState || nflState.season_type === 'pre' || nflState.season_type === 'off')
    ? 'Offseason FAAB'
    : 'Season FAAB'

  const entries = useMemo(() => {
    if (!rosters || !users) return []
    return rosters
      .map((r) => {
        const spent = r.settings.waiver_budget_used ?? 0
        const remaining = BUDGET - spent
        return {
          rosterId: r.roster_id,
          teamName: getTeamName(r.owner_id, users),
          spent,
          remaining,
          pctSpent: Math.min(100, Math.round((spent / BUDGET) * 100)),
        }
      })
      .sort((a, b) => b.remaining - a.remaining)
  }, [rosters, users])

  if (lr || lu) return <SkeletonLoader rows={6} />

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-sans text-h2 font-bold text-text">FAAB Budget</h2>
        <span className="text-label font-semibold text-gold bg-goldLow px-2.5 py-1 rounded-full">
          {poolLabel}
        </span>
      </div>

      <div className="bg-surface border border-borderLow rounded-lg divide-y divide-borderLow">
        {entries.map((entry, rank) => (
          <div key={entry.rosterId} className="px-4 py-3">
            <div className="flex items-center justify-between mb-1.5 gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-label text-mutedLow shrink-0 w-4 text-right">{rank + 1}</span>
                <span className="text-base font-semibold text-text truncate">{entry.teamName}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-mono text-num text-text font-bold">${entry.remaining}</span>
                <span className="font-mono text-small text-muted">${entry.spent} spent</span>
              </div>
            </div>
            {/* Progress bar */}
            <div className="h-1.5 bg-surfaceHi rounded-full overflow-hidden">
              <div
                className="h-full bg-gold rounded-full transition-all"
                style={{ width: `${entry.pctSpent}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <p className="text-small text-muted italic mt-3">
        FAAB does not roll over. Unspent budget disappears when the pool period ends.
      </p>
    </div>
  )
}
