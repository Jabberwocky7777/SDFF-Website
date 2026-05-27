import { useMemo, useState } from 'react'
import SectionHeader from '@/components/ui/SectionHeader'
import SkeletonLoader from '@/components/ui/SkeletonLoader'
import ShieldAvatar from '@/components/ui/ShieldAvatar'
import { useRosters } from '@/hooks/useRosters'
import { useUsers } from '@/hooks/useUsers'
import { useNflState } from '@/hooks/useNflState'
import { useAllMatchups } from '@/hooks/useAllMatchups'
import { computeStandings } from '@/lib/standings'
import { computePowerRankings } from '@/lib/powerRankings'
import { fmtRecord, fmtPts } from '@/lib/formatters'
import type { TeamRecord } from '@/types/domain'

type Tab = 'standings' | 'power'

function LuckBadge({ value }: { value: number }) {
  if (value > 5) return (
    <span className="font-mono text-num tabular text-green-400">+{value}</span>
  )
  if (value < -5) return (
    <span className="font-mono text-num tabular text-red-400">{value}</span>
  )
  return <span className="font-mono text-num tabular text-muted">{value > 0 ? '+' : ''}{value}</span>
}

function StandingsTable({ standings }: { standings: TeamRecord[] }) {
  return (
    <>
      <div className="bg-surface border border-borderLow overflow-hidden rounded-lg">
        {/* Header */}
        <div className="grid bg-surfaceHi border-b border-borderLow px-5 py-3.5"
             style={{ gridTemplateColumns: '2.5rem 1fr 5rem 4rem 4rem 5rem 5rem 3.5rem' }}>
          {['#', 'Team', 'Combined', 'H2H', 'Median', 'PF', 'MPF', 'Luck'].map((h, i) => (
            <div key={h} className={`text-label text-muted uppercase tracking-[0.04em] font-semibold ${i > 1 ? 'text-center' : ''} ${i === 3 || i === 4 ? 'hidden sm:block' : ''}`}>
              {h}
            </div>
          ))}
        </div>

        {standings.map((team, i) => {
          const inPlayoffs = team.seed != null && team.seed <= 6
          const isSeed6 = team.seed === 6
          const isBottomSix = i >= standings.length - 6

          return (
            <div
              key={team.rosterId}
              className={`grid px-5 py-3 border-b border-borderLow last:border-0 transition-colors hover:bg-white/3 ${
                inPlayoffs ? 'bg-goldLow' : isBottomSix ? 'bg-red-900/3' : ''
              }`}
              style={{ gridTemplateColumns: '2.5rem 1fr 5rem 4rem 4rem 5rem 5rem 3.5rem' }}
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

              {/* Combined */}
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

              {/* Luck */}
              <div className="flex items-center justify-center">
                <LuckBadge value={team.luckIndex} />
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-6 bg-surface border border-borderLow rounded-lg p-5 space-y-2">
        <div className="text-label uppercase font-bold text-muted mb-3">Notes</div>
        <ul className="space-y-1.5 text-base leading-relaxed text-text">
          <li><span className="text-gold font-bold">6*</span> — Seed 6 = highest PF outside seeds 1–5</li>
          <li><span className="text-gold font-bold">Combined</span> — H2H wins + weekly median wins (official seeding record)</li>
          <li><span className="text-gold font-bold">Median</span> — Each week every team gets a bonus W or L vs. the league median score</li>
          <li><span className="text-gold font-bold">MPF</span> — Max Points For; determines rookie draft order (reverse MPF, picks 1–9)</li>
          <li><span className="text-gold font-bold">Luck ±</span> — Difference between H2H win% and scoring-rank expected win%. Positive = lucky, negative = unlucky</li>
        </ul>
      </div>
    </>
  )
}

function PowerRankingsTab({ standings, allWeekMatchups }: {
  standings: TeamRecord[]
  allWeekMatchups: { roster_id: number; matchup_id: number; points: number }[][]
}) {
  const rankings = useMemo(() =>
    computePowerRankings(standings, allWeekMatchups),
    [standings, allWeekMatchups],
  )

  const luckiest = standings.reduce((best, cur) =>
    cur.luckIndex > best.luckIndex ? cur : best, standings[0])
  const snakeBitten = standings.reduce((worst, cur) =>
    cur.luckIndex < worst.luckIndex ? cur : worst, standings[0])

  if (rankings.length === 0) {
    return (
      <div className="bg-surface border border-borderLow rounded-lg p-8 text-center">
        <p className="text-base text-muted">Power rankings will appear once the season begins.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Callout cards */}
      {luckiest.luckIndex > 5 && snakeBitten.luckIndex < -5 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4">
            <div className="text-label font-bold text-green-400 uppercase mb-1">Luckiest Team</div>
            <div className="text-h3 font-bold text-text">{luckiest.teamName}</div>
            <div className="text-small text-muted mt-1">Luck index: +{luckiest.luckIndex} — winning record despite below-average scoring</div>
          </div>
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
            <div className="text-label font-bold text-red-400 uppercase mb-1">Snake Bitten</div>
            <div className="text-h3 font-bold text-text">{snakeBitten.teamName}</div>
            <div className="text-small text-muted mt-1">Luck index: {snakeBitten.luckIndex} — worse record than scoring deserves</div>
          </div>
        </div>
      )}

      {/* Rankings list */}
      <div className="bg-surface border border-borderLow rounded-lg divide-y divide-borderLow">
        {rankings.map((entry, idx) => (
          <div key={entry.rosterId} className="flex items-center gap-4 px-5 py-4 hover:bg-white/3 transition-colors">
            <div className="font-mono text-numLg font-bold text-muted w-8 shrink-0 text-center">
              {idx + 1}
            </div>
            <ShieldAvatar avatarUrl={entry.avatarUrl} teamName={entry.teamName} size={40} />
            <div className="flex-1 min-w-0">
              <div className="font-sans text-h3 font-semibold text-text">{entry.teamName}</div>
              <div className="text-small text-muted mt-0.5">{entry.summary}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-mono text-numLg font-bold text-gold">{entry.score}</div>
              <div className="text-label text-mutedLow">/ 100</div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-surface border border-borderLow rounded-lg p-5">
        <div className="text-label uppercase font-bold text-muted mb-3">Formula</div>
        <div className="space-y-1 text-small text-muted">
          <div>40% Combined record win%</div>
          <div>30% Points For (normalized 0–100)</div>
          <div>20% Max Points For (normalized 0–100)</div>
          <div>10% Recent form (last 3 weeks combined)</div>
        </div>
      </div>
    </div>
  )
}

export default function Standings() {
  const [tab, setTab] = useState<Tab>('standings')
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
          Combined record = H2H wins + median wins. Seed 6 goes to the highest scorer outside the top 5.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 bg-surfaceHi border border-borderLow rounded-lg p-1 w-fit">
        {(['standings', 'power'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-small font-semibold rounded-md transition-all ${
              tab === t
                ? 'bg-gold text-[#1A1100]'
                : 'text-muted hover:text-text'
            }`}
          >
            {t === 'standings' ? 'Standings' : 'Power Rankings'}
          </button>
        ))}
      </div>

      {tab === 'standings' ? (
        <StandingsTable standings={standings} />
      ) : (
        <PowerRankingsTab standings={standings} allWeekMatchups={allMatchups} />
      )}
    </div>
  )
}
