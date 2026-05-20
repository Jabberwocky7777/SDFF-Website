import { useMemo } from 'react'
import SectionHeader from '@/components/ui/SectionHeader'
import SkeletonLoader from '@/components/ui/SkeletonLoader'
import ShieldAvatar from '@/components/ui/ShieldAvatar'
import { useRosters } from '@/hooks/useRosters'
import { useUsers } from '@/hooks/useUsers'
import { useNflState } from '@/hooks/useNflState'
import { useAllMatchups } from '@/hooks/useAllMatchups'
import { computeStandings } from '@/lib/standings'
import { fmtRecord, fmtPts } from '@/lib/formatters'

export default function Standings() {
  const { data: rosters, isLoading: r } = useRosters()
  const { data: users, isLoading: u } = useUsers()
  const { data: nflState, isLoading: s } = useNflState()
  const currentWeek = nflState?.week ?? 0
  const { allMatchups, isLoading: m } = useAllMatchups(currentWeek)

  const standings = useMemo(() => {
    if (!rosters || !users) return []
    return computeStandings(rosters, users, allMatchups)
  }, [rosters, users, allMatchups])

  if (r || u || s || m) return (
    <div>
      <SectionHeader>Standings</SectionHeader>
      <SkeletonLoader rows={12} />
    </div>
  )

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-sans text-hero font-bold text-text mb-2">Standings</h1>
        <p className="text-body text-muted leading-relaxed max-w-2xl">
          Overall record = H2H wins + median wins. Seed 6 goes to the highest scorer outside the top 5.
        </p>
      </div>

      <div className="bg-surface border border-borderLow overflow-hidden rounded-lg">
        {/* Table header */}
        <div className="grid grid-cols-[2.5rem_1fr_5rem_4rem_4rem_5rem_5rem] gap-0 bg-surfaceHi border-b border-borderLow px-5 py-3.5">
          <div className="text-label text-muted uppercase tracking-[0.04em] font-semibold">#</div>
          <div className="text-label text-muted uppercase tracking-[0.04em] font-semibold">Team</div>
          <div className="text-label text-muted uppercase tracking-[0.04em] font-semibold text-center">Overall</div>
          <div className="text-label text-muted uppercase tracking-[0.04em] font-semibold text-center hidden sm:block">H2H</div>
          <div className="text-label text-muted uppercase tracking-[0.04em] font-semibold text-center hidden sm:block">Med</div>
          <div className="text-label text-muted uppercase tracking-[0.04em] font-semibold text-center">PF</div>
          <div className="text-label text-muted uppercase tracking-[0.04em] font-semibold text-center">MPF</div>
        </div>

        {standings.map((team, i) => {
          const inPlayoffs = team.seed != null && team.seed <= 6
          const isSeed6 = team.seed === 6
          const isBottomSix = i >= standings.length - 6

          return (
            <div
              key={team.rosterId}
              className={`grid grid-cols-[2.5rem_1fr_5rem_4rem_4rem_5rem_5rem] gap-0 px-5 py-3 border-b border-borderLow last:border-0 transition-colors hover:bg-white/3 ${
                inPlayoffs ? 'bg-goldLow' : isBottomSix ? 'bg-red-900/3' : ''
              }`}
            >
              {/* Seed */}
              <div className="flex items-center">
                <div className={`w-[30px] h-[30px] rounded-md flex items-center justify-center text-small font-bold ${
                  inPlayoffs
                    ? 'bg-gold text-[#1A1100]'
                    : 'border border-borderLow text-muted'
                }`}>
                  {isSeed6 ? '6*' : (team.seed ?? i + 1)}
                </div>
              </div>

              {/* Team */}
              <div className="flex items-center gap-2 min-w-0">
                <ShieldAvatar avatarUrl={team.avatarUrl} teamName={team.teamName} size={36} />
                <span className="font-sans text-base font-semibold text-text truncate">
                  {team.teamName}
                </span>
                {inPlayoffs && (
                  <span className="shrink-0 text-label font-semibold text-gold hidden lg:inline">
                    {isSeed6 ? 'Wild card · highest PF' : 'Playoff bid'}
                  </span>
                )}
              </div>

              {/* Overall */}
              <div className="flex items-center justify-center">
                <span className="font-mono text-num tabular text-text">
                  {fmtRecord(team.totalWins, team.totalLosses)}
                </span>
              </div>

              {/* H2H */}
              <div className="items-center justify-center hidden sm:flex">
                <span className="font-mono text-num tabular text-muted">
                  {fmtRecord(team.h2hWins, team.h2hLosses)}
                </span>
              </div>

              {/* Median */}
              <div className="items-center justify-center hidden sm:flex">
                <span className="font-mono text-num tabular text-muted">
                  {fmtRecord(team.medianWins, team.medianLosses)}
                </span>
              </div>

              {/* PF */}
              <div className="flex items-center justify-center">
                <span className="font-mono text-num tabular text-text">
                  {team.pf > 0 ? fmtPts(team.pf) : <span className="text-muted">—</span>}
                </span>
              </div>

              {/* MPF */}
              <div className="flex items-center justify-center">
                <span className="font-mono text-num tabular text-gold">
                  {team.mpf > 0 ? fmtPts(team.mpf) : <span className="text-muted">—</span>}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-6 bg-surface border border-borderLow rounded-lg p-5">
        <div className="text-label uppercase font-bold text-muted mb-3">Notes</div>
        <ul className="space-y-1.5 text-base leading-relaxed text-text">
          <li><span className="text-gold font-bold">6*</span> — Seed 6 = highest PF outside seeds 1–5</li>
          <li><span className="text-gold font-bold">Max PF</span> — determines rookie draft order (reverse MPF, picks 1–9)</li>
          <li><span className="text-gold font-bold">Overall</span> — H2H record + weekly median wins</li>
        </ul>
      </div>
    </div>
  )
}
