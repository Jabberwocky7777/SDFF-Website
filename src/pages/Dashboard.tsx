import SectionHeader from '@/components/ui/SectionHeader'
import Card from '@/components/ui/Card'
import GoldRule from '@/components/ui/GoldRule'
import { useNflState } from '@/hooks/useNflState'
import { useRosters } from '@/hooks/useRosters'
import { useUsers } from '@/hooks/useUsers'
import SkeletonLoader from '@/components/ui/SkeletonLoader'
import DotDivider from '@/components/ui/DotDivider'

const STATUS_LABEL: Record<string, string> = {
  pre: 'Pre-Season',
  off: 'Offseason',
  regular: 'Regular Season',
  post: 'Playoffs',
}

function PreDraftBanner() {
  return (
    <div className="relative overflow-hidden rounded border border-gold/25 bg-surface mb-10">
      {/* Corner brackets */}
      <span className="absolute top-2 left-3 text-gold/30 text-xs font-mono">┌</span>
      <span className="absolute top-2 right-3 text-gold/30 text-xs font-mono">┐</span>
      <span className="absolute bottom-2 left-3 text-gold/30 text-xs font-mono">└</span>
      <span className="absolute bottom-2 right-3 text-gold/30 text-xs font-mono">┘</span>

      {/* Subtle radial glow behind logo */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-64 h-64 rounded-full bg-gold/5 blur-3xl" />
      </div>

      <div className="relative flex flex-col items-center py-16 px-8 text-center">
        <img src="/logo.svg" alt="" className="h-20 w-20 mb-6 opacity-90" />
        <h1 className="font-serif text-[#F6F0E2] text-3xl font-bold tracking-wide mb-3">
          Awaiting Draft
        </h1>
        <p className="text-[#52526A] text-sm font-sans max-w-sm leading-relaxed">
          The 2026 season hasn't kicked off yet. Rosters and matchup data will populate after the startup draft.
        </p>
        <DotDivider className="my-6 w-24" />
        <span className="font-sans text-[#52526A] text-[10px] uppercase tracking-[0.3em]">Est. 2026</span>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { data: nflState, isLoading: stateLoading } = useNflState()
  const { data: rosters, isLoading: rostersLoading } = useRosters()
  const { data: users } = useUsers()

  const isPreDraft = !nflState || nflState.season_type === 'pre' || nflState.season_type === 'off' || nflState.week === 0

  const statusLabel = nflState
    ? STATUS_LABEL[nflState.season_type] ?? nflState.season_type
    : 'Pre-Draft'

  if (stateLoading || rostersLoading) {
    return (
      <div>
        <SectionHeader>Dashboard</SectionHeader>
        <SkeletonLoader rows={4} />
      </div>
    )
  }

  return (
    <div>
      {isPreDraft ? (
        <PreDraftBanner />
      ) : (
        <>
          <SectionHeader>Week {nflState?.week} Matchups</SectionHeader>
          <p className="text-[#52526A] text-sm mb-8">Matchup board coming soon.</p>
        </>
      )}

      {rosters && (
        <>
          <SectionHeader>League at a Glance</SectionHeader>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-10">
            <Card className="py-5">
              <div className="text-[#52526A] text-[10px] uppercase tracking-widest font-sans mb-2">Teams</div>
              <div className="font-mono text-3xl text-[#F6F0E2] font-bold">{rosters.length}</div>
            </Card>
            <Card className="py-5">
              <div className="text-[#52526A] text-[10px] uppercase tracking-widest font-sans mb-2">Season</div>
              <div className="font-mono text-3xl text-[#F6F0E2] font-bold">2026</div>
            </Card>
            <Card className="py-5">
              <div className="text-[#52526A] text-[10px] uppercase tracking-widest font-sans mb-2">Status</div>
              <div className="font-mono text-lg text-gold font-semibold">{statusLabel}</div>
            </Card>
          </div>

          {users && (
            <>
              <GoldRule className="mb-8" />
              <SectionHeader>Managers</SectionHeader>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {users.map((user) => (
                  <div key={user.user_id} className="flex items-center gap-2 p-3 bg-surface border border-gold/10 rounded">
                    {user.avatar ? (
                      <img
                        src={`https://sleepercdn.com/avatars/thumbs/${user.avatar}`}
                        alt=""
                        className="w-7 h-7 rounded-full shrink-0"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-gold/20 shrink-0 flex items-center justify-center">
                        <span className="text-gold text-[10px] font-serif font-bold">
                          {user.display_name[0].toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-[#F6F0E2] text-xs font-sans truncate">
                        {user.metadata?.team_name || user.display_name}
                      </div>
                      {user.metadata?.team_name && (
                        <div className="text-[#52526A] text-[10px] font-sans truncate">{user.display_name}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
