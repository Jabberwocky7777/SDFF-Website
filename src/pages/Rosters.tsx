import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLeagueSlug } from '@/context/LeagueScope'
import SectionHeader from '@/components/ui/SectionHeader'
import Card from '@/components/ui/Card'
import GoldRule from '@/components/ui/GoldRule'
import ShieldAvatar from '@/components/ui/ShieldAvatar'
import SkeletonLoader from '@/components/ui/SkeletonLoader'
import { useRosters } from '@/hooks/useRosters'
import { useUsers } from '@/hooks/useUsers'
import { usePlayers } from '@/hooks/usePlayers'
import { useNflState } from '@/hooks/useNflState'
import { enrichRoster } from '@/lib/enrichRoster'
import { computeRosterAgeProfile, type RosterWindow } from '@/lib/ageTier'
import AgeTierBadge from '@/components/ui/AgeTierBadge'
import type { EnrichedRoster } from '@/types/domain'

const WINDOW_COLORS: Record<RosterWindow, string> = {
  Rebuilding: 'bg-green-900/30 text-green-400 border border-green-500/30',
  Contending: 'bg-blue-900/30 text-blue-300 border border-blue-500/30',
  'Win-Now':  'bg-red-900/30 text-red-400 border border-red-500/30',
  Mixed:      'bg-zinc-800 text-zinc-300 border border-zinc-600/30',
}

type AgeSortDir = 'asc' | 'desc'

interface AgeRowProps {
  roster: EnrichedRoster
}

function AgeRow({ roster }: AgeRowProps) {
  const profile = computeRosterAgeProfile(roster)

  if (profile.total === 0) {
    return (
      <div className="flex items-center gap-4 px-4 py-3 border-b border-borderLow last:border-0">
        <ShieldAvatar avatarUrl={roster.avatarUrl} teamName={roster.teamName} size={32} />
        <span className="text-base font-semibold text-text flex-1">{roster.teamName}</span>
        <span className="text-muted text-small italic">No player data</span>
      </div>
    )
  }

  const youngPct = profile.youngCount / profile.total
  const primePct = profile.primeCount / profile.total
  const agingPct = profile.agingCount / profile.total

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-borderLow last:border-0 flex-wrap sm:flex-nowrap hover:bg-white/3 transition-colors">
      <ShieldAvatar avatarUrl={roster.avatarUrl} teamName={roster.teamName} size={32} />
      <span className="text-base font-semibold text-text w-40 shrink-0 truncate">{roster.teamName}</span>

      <div className="flex-1 min-w-[120px]">
        {/* Stacked bar */}
        <div className="h-3 rounded-full overflow-hidden flex bg-surfaceHi">
          {youngPct > 0 && (
            <div
              className="h-full bg-green-500 transition-all"
              style={{ width: `${youngPct * 100}%` }}
              title={`Young (≤24): ${profile.youngCount}`}
            />
          )}
          {primePct > 0 && (
            <div
              className="h-full bg-yellow-400 transition-all"
              style={{ width: `${primePct * 100}%` }}
              title={`Prime (25–28): ${profile.primeCount}`}
            />
          )}
          {agingPct > 0 && (
            <div
              className="h-full bg-red-500 transition-all"
              style={{ width: `${agingPct * 100}%` }}
              title={`Aging (29+): ${profile.agingCount}`}
            />
          )}
        </div>
        <div className="flex gap-3 mt-1">
          <span className="text-label text-green-400">{profile.youngCount} young</span>
          <span className="text-label text-yellow-400">{profile.primeCount} prime</span>
          <span className="text-label text-red-400">{profile.agingCount} aging</span>
        </div>
      </div>

      <span className="font-mono text-num text-text w-10 text-center shrink-0">
        {profile.avgAge ?? '—'}
      </span>

      <span className={`text-label font-semibold px-2 py-0.5 rounded shrink-0 ${WINDOW_COLORS[profile.window]}`}>
        {profile.window}
      </span>
    </div>
  )
}

export default function Rosters() {
  const slug = useLeagueSlug()
  const { data: rosters, isLoading: r } = useRosters()
  const { data: users, isLoading: u } = useUsers()
  const { data: players, isLoading: p } = usePlayers()
  const { data: nflState } = useNflState()
  const [ageSortDir, setAgeSortDir] = useState<AgeSortDir>('asc')

  const taxiLocked = nflState?.season_type === 'regular' || nflState?.season_type === 'post'

  const enriched = useMemo(() => {
    if (!rosters || !users || !players) return []
    return rosters.map((r) => enrichRoster(r, users, players))
  }, [rosters, users, players])

  const sortedByAge = useMemo(() => {
    return [...enriched].sort((a, b) => {
      const pa = computeRosterAgeProfile(a).avgAge ?? 99
      const pb = computeRosterAgeProfile(b).avgAge ?? 99
      return ageSortDir === 'asc' ? pa - pb : pb - pa
    })
  }, [enriched, ageSortDir])

  const playersLoading = r || u || p

  if (r || u) return (
    <div>
      <SectionHeader>Rosters</SectionHeader>
      <SkeletonLoader rows={12} />
    </div>
  )

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-sans text-h1 font-bold text-text mb-1">Rosters</h1>
        <p className="text-body text-muted">
          {playersLoading
            ? 'Loading player data…'
            : 'Click any team to see their full roster with age tiers and taxi squad.'}
        </p>
      </div>

      {/* ── Roster Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {enriched.map((roster) => {
          const hasPlayers = roster.starters.length > 0 || roster.bench.length > 0

          return (
            <Link key={roster.rosterId} to={`/l/${slug}/rosters/${roster.rosterId}`}>
              <Card className="hover:border-border transition-all duration-150 cursor-pointer h-full">
                {/* Header */}
                <div className="flex items-center gap-3 mb-4 pb-3 border-b border-borderLow">
                  <ShieldAvatar avatarUrl={roster.avatarUrl} teamName={roster.teamName} size={38} />
                  <div className="min-w-0">
                    <div className="font-sans text-base font-semibold text-text leading-tight truncate">
                      {roster.teamName}
                    </div>
                    <div className="text-small text-muted mt-0.5">
                      {hasPlayers
                        ? `${roster.starters.length + roster.bench.length} players${roster.taxi.length ? ` · ${roster.taxi.length} taxi` : ''}`
                        : 'No players yet'}
                    </div>
                  </div>
                </div>

                {/* Player preview */}
                {hasPlayers ? (
                  <div className="space-y-1.5">
                    {roster.starters.slice(0, 5).map((player) => (
                      <div key={player.playerId} className="flex items-center gap-2">
                        <span className="text-label text-gold/70 font-mono w-7 shrink-0 text-right">{player.position}</span>
                        <span className="text-small text-text truncate flex-1">{player.fullName}</span>
                        <AgeTierBadge tier={player.ageTier} />
                      </div>
                    ))}
                    {roster.starters.length > 5 && (
                      <div className="text-small text-muted pl-9">
                        +{roster.starters.length - 5 + roster.bench.length} more
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-base text-muted font-sans italic">
                    Roster populates after the draft.
                  </p>
                )}

                {taxiLocked && roster.taxi.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-borderLow text-small text-muted font-sans">
                    🔒 Taxi locked for season
                  </div>
                )}
              </Card>
            </Link>
          )
        })}
      </div>

      {/* ── Age Analysis ─────────────────────────────────────────────────── */}
      {enriched.length > 0 && (
        <>
          <GoldRule className="my-10" />

          <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="font-sans text-h2 font-bold text-text mb-1">Age Analysis</h2>
              <p className="text-base text-muted">
                Roster window based on the top 10 players. Green ≤ 24, yellow 25–28, red 29+.
              </p>
            </div>
            <button
              onClick={() => setAgeSortDir((d) => d === 'asc' ? 'desc' : 'asc')}
              className="text-small font-semibold text-muted hover:text-text transition-colors bg-surfaceHi border border-borderLow px-3 py-1.5 rounded-md"
            >
              Avg Age {ageSortDir === 'asc' ? '↑ Young first' : '↓ Old first'}
            </button>
          </div>

          {playersLoading ? (
            <SkeletonLoader rows={12} />
          ) : (
            <>
              <div className="bg-surface border border-borderLow rounded-lg overflow-hidden">
                {/* Header */}
                <div className="hidden sm:flex items-center gap-3 px-4 py-2.5 bg-surfaceHi border-b border-borderLow">
                  <div className="w-8 shrink-0" />
                  <div className="text-label text-muted uppercase tracking-[0.04em] font-semibold w-40 shrink-0">Team</div>
                  <div className="text-label text-muted uppercase tracking-[0.04em] font-semibold flex-1">Age Distribution</div>
                  <div className="text-label text-muted uppercase tracking-[0.04em] font-semibold w-10 text-center shrink-0">Avg</div>
                  <div className="text-label text-muted uppercase tracking-[0.04em] font-semibold shrink-0">Window</div>
                </div>

                {sortedByAge.map((roster) => (
                  <AgeRow key={roster.rosterId} roster={roster} />
                ))}
              </div>

              <div className="flex gap-4 mt-3">
                <span className="text-label text-green-400 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" /> Young (≤24)
                </span>
                <span className="text-label text-yellow-400 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-yellow-400 inline-block" /> Prime (25–28)
                </span>
                <span className="text-label text-red-400 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" /> Aging (29+)
                </span>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
