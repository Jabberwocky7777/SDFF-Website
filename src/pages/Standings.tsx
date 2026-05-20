import { useMemo } from 'react'
import SectionHeader from '@/components/ui/SectionHeader'
import SkeletonLoader from '@/components/ui/SkeletonLoader'
import GoldRule from '@/components/ui/GoldRule'
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
        <h1 className="font-serif text-[#F6F0E2] text-2xl font-bold mb-1">Standings</h1>
        <p className="text-muted text-sm font-sans">
          Overall record = H2H wins + median wins. Seed 6 goes to the highest scorer outside the top 5.
        </p>
      </div>

      <div className="bg-surface border border-gold/20 overflow-hidden rounded">
        {/* Table header */}
        <div className="grid grid-cols-[2rem_1fr_5rem_4rem_4rem_5rem_5rem] gap-0 border-b border-gold/20 px-4 py-3">
          <div className="text-muted text-[10px] uppercase tracking-wider font-sans">#</div>
          <div className="text-muted text-[10px] uppercase tracking-wider font-sans">Team</div>
          <div className="text-muted text-[10px] uppercase tracking-wider font-sans text-center">Overall</div>
          <div className="text-muted text-[10px] uppercase tracking-wider font-sans text-center hidden sm:block">H2H</div>
          <div className="text-muted text-[10px] uppercase tracking-wider font-sans text-center hidden sm:block">Med</div>
          <div className="text-muted text-[10px] uppercase tracking-wider font-sans text-center">PF</div>
          <div className="text-muted text-[10px] uppercase tracking-wider font-sans text-center">MPF</div>
        </div>

        {standings.map((team, i) => {
          const inPlayoffs = team.seed != null && team.seed <= 6
          const isSeed6 = team.seed === 6
          const isBottomSix = i >= standings.length - 6

          return (
            <div
              key={team.rosterId}
              className={`grid grid-cols-[2rem_1fr_5rem_4rem_4rem_5rem_5rem] gap-0 px-4 py-3 border-b border-gold/10 last:border-0 transition-colors hover:bg-white/3 ${
                inPlayoffs ? 'bg-gold/3' : isBottomSix ? 'bg-red-900/3' : ''
              }`}
            >
              {/* Seed */}
              <div className="flex items-center">
                <span className={`font-mono text-sm font-bold ${
                  inPlayoffs ? 'text-gold' : 'text-muted'
                }`}>
                  {team.seed != null ? (
                    isSeed6 ? '6*' : team.seed
                  ) : (
                    i + 1
                  )}
                </span>
              </div>

              {/* Team */}
              <div className="flex items-center gap-2 min-w-0">
                <ShieldAvatar avatarUrl={team.avatarUrl} teamName={team.teamName} size={30} />
                <span className={`font-sans text-sm truncate ${inPlayoffs ? 'text-[#F6F0E2]' : 'text-[#C8C4B8]'}`}>
                  {team.teamName}
                </span>
                {inPlayoffs && !isSeed6 && (
                  <span className="shrink-0 text-[9px] font-sans uppercase tracking-wider text-gold/60 border border-gold/20 px-1 py-0.5 rounded hidden lg:inline">
                    Playoff
                  </span>
                )}
              </div>

              {/* Overall */}
              <div className="flex items-center justify-center">
                <span className={`font-mono text-sm ${inPlayoffs ? 'text-[#F6F0E2]' : 'text-muted'}`}>
                  {fmtRecord(team.totalWins, team.totalLosses)}
                </span>
              </div>

              {/* H2H */}
              <div className="items-center justify-center hidden sm:flex">
                <span className="font-mono text-xs text-muted">
                  {fmtRecord(team.h2hWins, team.h2hLosses)}
                </span>
              </div>

              {/* Median */}
              <div className="items-center justify-center hidden sm:flex">
                <span className="font-mono text-xs text-muted">
                  {fmtRecord(team.medianWins, team.medianLosses)}
                </span>
              </div>

              {/* PF */}
              <div className="flex items-center justify-center">
                <span className="font-mono text-sm text-[#F6F0E2]">
                  {team.pf > 0 ? fmtPts(team.pf) : <span className="text-muted">—</span>}
                </span>
              </div>

              {/* MPF */}
              <div className="flex items-center justify-center">
                <span className="font-mono text-sm text-gold/70">
                  {team.mpf > 0 ? fmtPts(team.mpf) : <span className="text-muted">—</span>}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <GoldRule className="mt-6 mb-4" />
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted text-xs font-sans">
        <span><span className="text-gold font-mono">*</span> Seed 6 = highest PF outside seeds 1–5</span>
        <span>MPF = Max Points For — determines rookie draft order (reverse MPF, picks 1–9)</span>
        <span>Overall = H2H record + weekly median wins</span>
      </div>
    </div>
  )
}
