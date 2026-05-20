import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import SectionHeader from '@/components/ui/SectionHeader'
import Card from '@/components/ui/Card'
import ShieldAvatar from '@/components/ui/ShieldAvatar'
import SkeletonLoader from '@/components/ui/SkeletonLoader'
import { useRosters } from '@/hooks/useRosters'
import { useUsers } from '@/hooks/useUsers'
import { usePlayers } from '@/hooks/usePlayers'
import { useNflState } from '@/hooks/useNflState'
import { enrichRoster } from '@/lib/enrichRoster'
import AgeTierBadge from '@/components/ui/AgeTierBadge'

export default function Rosters() {
  const { data: rosters, isLoading: r } = useRosters()
  const { data: users, isLoading: u } = useUsers()
  const { data: players, isLoading: p } = usePlayers()
  const { data: nflState } = useNflState()

  const taxiLocked = nflState?.season_type === 'regular' || nflState?.season_type === 'post'

  const enriched = useMemo(() => {
    if (!rosters || !users || !players) return []
    return rosters.map((r) => enrichRoster(r, users, players))
  }, [rosters, users, players])

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
        <h1 className="font-serif text-[#F6F0E2] text-2xl font-bold mb-1">Rosters</h1>
        <p className="text-muted text-sm font-sans">
          {playersLoading
            ? 'Loading player data…'
            : 'Click any team to see their full roster with age tiers and taxi squad.'}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {enriched.map((roster) => {
          const hasPlayers = roster.starters.length > 0 || roster.bench.length > 0

          return (
            <Link key={roster.rosterId} to={`/rosters/${roster.rosterId}`}>
              <Card className="hover:border-gold/50 transition-all duration-150 cursor-pointer h-full">
                {/* Header */}
                <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gold/10">
                  <ShieldAvatar avatarUrl={roster.avatarUrl} teamName={roster.teamName} size={38} />
                  <div className="min-w-0">
                    <div className="font-serif text-[#F6F0E2] font-semibold text-sm leading-tight truncate">
                      {roster.teamName}
                    </div>
                    <div className="text-muted text-xs font-sans mt-0.5">
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
                      <div key={player.playerId} className="flex items-center gap-2 text-xs">
                        <span className="text-gold/60 font-mono w-7 shrink-0 text-right">{player.position}</span>
                        <span className="text-[#C8C4B8] truncate flex-1">{player.fullName}</span>
                        <AgeTierBadge tier={player.ageTier} />
                      </div>
                    ))}
                    {roster.starters.length > 5 && (
                      <div className="text-muted text-xs pl-9">
                        +{roster.starters.length - 5 + roster.bench.length} more
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-muted text-xs font-sans italic">
                    Roster populates after the draft.
                  </p>
                )}

                {taxiLocked && roster.taxi.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-gold/10 text-[10px] text-muted font-sans">
                    🔒 Taxi locked for season
                  </div>
                )}
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
