import { useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useLeagueSlug } from '@/context/LeagueScope'
import SectionHeader from '@/components/ui/SectionHeader'
import Card from '@/components/ui/Card'
import ShieldAvatar from '@/components/ui/ShieldAvatar'
import AgeTierBadge from '@/components/ui/AgeTierBadge'
import SkeletonLoader from '@/components/ui/SkeletonLoader'
import { useRosters } from '@/hooks/useRosters'
import { useUsers } from '@/hooks/useUsers'
import { usePlayers } from '@/hooks/usePlayers'
import { useNflState } from '@/hooks/useNflState'
import { enrichRoster } from '@/lib/enrichRoster'
import type { EnrichedPlayer } from '@/types/domain'

const POSITION_COLOR: Record<string, string> = {
  QB: 'text-red-400',
  RB: 'text-green-400',
  WR: 'text-blue-400',
  TE: 'text-yellow-400',
  K: 'text-muted',
  DEF: 'text-muted',
}

function PlayerRow({ player }: { player: EnrichedPlayer }) {
  const posColor = POSITION_COLOR[player.position] ?? 'text-muted'
  return (
    <div className="flex items-center gap-3 py-2 border-b border-borderLow last:border-0">
      <span className={`font-mono text-small w-8 shrink-0 font-semibold ${posColor}`}>
        {player.position}
      </span>
      <span className="text-base text-text flex-1 truncate">{player.fullName}</span>
      <div className="flex items-center gap-2 shrink-0">
        {player.nflTeam && (
          <span className="text-small text-muted font-mono">{player.nflTeam}</span>
        )}
        {player.age != null && (
          <span className="text-small text-muted font-mono">Age {player.age}</span>
        )}
        <AgeTierBadge tier={player.ageTier} />
        {player.injuryStatus && (
          <span className="text-small text-red-400">{player.injuryStatus}</span>
        )}
      </div>
    </div>
  )
}

export default function TeamDetail() {
  const { teamId } = useParams<{ teamId: string }>()
  const slug = useLeagueSlug()
  const { data: rosters, isLoading: r } = useRosters()
  const { data: users, isLoading: u } = useUsers()
  const { data: players, isLoading: p } = usePlayers()
  const { data: nflState } = useNflState()

  const taxiLocked = nflState?.season_type === 'regular' || nflState?.season_type === 'post'

  const roster = useMemo(() => {
    const raw = rosters?.find((ro) => ro.roster_id === Number(teamId))
    if (!raw || !users || !players) return null
    return enrichRoster(raw, users, players)
  }, [rosters, users, players, teamId])

  if (r || u || p) return (
    <div>
      <SkeletonLoader rows={8} />
    </div>
  )

  if (!roster) return (
    <div className="text-muted text-base">Team not found.</div>
  )

  return (
    <div>
      <Link to={`/l/${slug}/rosters`} className="text-gold/70 text-small font-sans hover:text-gold transition-colors mb-5 inline-flex items-center gap-1">
        ← All Rosters
      </Link>

      <div className="flex items-center gap-4 mb-8 pb-6 border-b border-borderLow">
        <ShieldAvatar avatarUrl={roster.avatarUrl} teamName={roster.teamName} size={56} />
        <div>
          <h1 className="font-sans text-h1 font-bold text-text leading-tight">{roster.teamName}</h1>
          <div className="text-small text-muted mt-1.5 flex items-center gap-4">
            <span>FAAB: <span className="text-gold font-mono font-semibold">${roster.faabRemaining}</span></span>
            <span>{roster.starters.length} starters · {roster.bench.length} bench{roster.taxi.length ? ` · ${roster.taxi.length} taxi` : ''}{roster.ir.length ? ` · ${roster.ir.length} IR` : ''}</span>
          </div>
        </div>
      </div>

      <Card className="mb-6">
        <SectionHeader>Starters</SectionHeader>
        {roster.starters.length === 0 ? (
          <p className="text-muted text-base">No starters set.</p>
        ) : (
          roster.starters.map((p) => <PlayerRow key={p.playerId} player={p} />)
        )}
      </Card>

      {roster.bench.length > 0 && (
        <div className="mb-4">
          <Card className="mb-6">
            <SectionHeader>Bench</SectionHeader>
            {roster.bench.map((p) => <PlayerRow key={p.playerId} player={p} />)}
          </Card>
        </div>
      )}

      {roster.taxi.length > 0 && (
        <div className="mb-4">
          <Card className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <SectionHeader className="mb-0">Taxi Squad</SectionHeader>
              {taxiLocked && (
                <span className="text-small text-gold/50 font-sans">🔒 Locked for season</span>
              )}
            </div>
            <p className="text-small text-muted font-sans mb-3">
              Only original drafting manager may taxi. Eligible up to 2 years if not activated.
            </p>
            {roster.taxi.map((p) => <PlayerRow key={p.playerId} player={p} />)}
          </Card>
        </div>
      )}

      {roster.ir.length > 0 && (
        <div className="mb-4">
          <Card>
            <SectionHeader>IR / Reserve</SectionHeader>
            {roster.ir.map((p) => <PlayerRow key={p.playerId} player={p} />)}
          </Card>
        </div>
      )}

      <div className="mt-6 text-small text-muted font-sans">
        <span className="text-green-400">●</span> Prime &nbsp;
        <span className="text-yellow-400">●</span> Ascending &nbsp;
        <span className="text-red-400">●</span> Declining
      </div>
    </div>
  )
}
