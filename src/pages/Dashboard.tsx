import { Link } from 'react-router-dom'
import SectionHeader from '@/components/ui/SectionHeader'
import Card from '@/components/ui/Card'
import GoldRule from '@/components/ui/GoldRule'
import { useNflState } from '@/hooks/useNflState'
import { useLeague } from '@/hooks/useLeague'
import { useRosters } from '@/hooks/useRosters'
import { useUsers } from '@/hooks/useUsers'
import { useAnnouncements } from '@/hooks/useAnnouncements'
import SkeletonLoader from '@/components/ui/SkeletonLoader'
import FaabTracker from '@/components/FaabTracker'
import TransactionFeed from '@/components/TransactionFeed'
import { LEAGUE_CONFIG } from '@/data/leagueConfig'

const STATUS_LABEL: Record<string, string> = {
  pre: 'Pre-Season',
  off: 'Offseason',
  regular: 'Regular Season',
  post: 'Playoffs',
}

const LEAGUE_STATUS_LABEL: Record<string, string> = {
  pre_draft: 'Pre-Draft',
  drafting:  'Drafting',
  in_season: 'In Season',
  complete:  'Complete',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function formatDraftDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

const DRAFT_DATE_DISPLAY = formatDraftDate(LEAGUE_CONFIG.draft.startupDraftDate)

function PreDraftBanner({ isDrafting }: { isDrafting?: boolean }) {
  return (
    <div className="rounded-lg border border-borderLow bg-surface mb-10">
      <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-start py-8 px-5 sm:py-12 sm:px-8">
        <img src="/logo.svg" alt="" className="h-20 w-20 sm:h-[120px] sm:w-[120px] shrink-0 opacity-90" />
        <div>
          <p className="text-label text-gold uppercase tracking-[0.06em] font-semibold mb-2">
            {isDrafting ? 'Draft in progress' : 'Pre-season'}
          </p>
          <h1 className="text-h1 sm:text-hero font-bold text-text mb-3">
            {isDrafting ? 'Startup draft underway' : 'Awaiting the startup draft'}
          </h1>
          <p className="text-body text-muted leading-relaxed max-w-xl mb-6">
            {isDrafting
              ? 'The startup draft is live. Head to the Draft Board to follow picks in real time.'
              : 'The 2026 season hasn\'t kicked off yet. Rosters and matchup data will populate after the startup draft.'}
          </p>
          <div className="flex gap-3 flex-wrap">
            {isDrafting ? (
              <Link
                to="/draft"
                className="bg-gold text-[#1A1100] font-semibold text-small px-4 py-2.5 rounded-lg"
              >
                Open Draft Board →
              </Link>
            ) : (
              <div className="bg-gold text-[#1A1100] font-semibold text-small px-4 py-2.5 rounded-lg">
                Draft · {DRAFT_DATE_DISPLAY}
              </div>
            )}
            <Link
              to="/bylaws"
              className="border border-border text-text text-small font-medium px-4 py-2.5 rounded-lg hover:bg-white/5 transition-colors"
            >
              Read the bylaws
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function AnnouncementsWidget() {
  const { data: announcements } = useAnnouncements()

  if (!announcements || announcements.length === 0) return null

  const recent = announcements.slice(0, 2)

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <SectionHeader className="mb-0">Latest News</SectionHeader>
        <Link
          to="/announcements"
          className="text-small font-medium text-muted hover:text-gold transition-colors"
        >
          View all →
        </Link>
      </div>
      <div className="space-y-3 mb-10">
        {recent.map((a) => (
          <div
            key={a.id}
            className={`bg-surface border rounded-lg p-4 ${a.pinned ? 'border-border' : 'border-borderLow'}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {a.pinned && (
                    <span className="bg-goldLow text-gold text-label font-bold px-2.5 py-1 rounded-full shrink-0">Pinned</span>
                  )}
                  <h3 className="font-sans text-h3 font-semibold text-text truncate">{a.title}</h3>
                </div>
                <p className="text-small text-mutedLow mb-2">{formatDate(a.createdAt)}</p>
                <p className="text-base text-muted leading-relaxed line-clamp-2">{a.body}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

export default function Dashboard() {
  const { data: nflState, isLoading: stateLoading } = useNflState()
  const { data: league, isLoading: leagueLoading } = useLeague()
  const { data: rosters, isLoading: rostersLoading } = useRosters()
  const { data: users } = useUsers()

  // Use the league's own status as the primary signal — it's authoritative.
  // Fall back to NFL state checks if the league object hasn't loaded yet.
  const leagueStatus = league?.status
  const isPreDraft = leagueStatus === 'pre_draft' ||
    leagueStatus === 'drafting' ||
    (!league && (!nflState || nflState.season_type === 'pre' || nflState.season_type === 'off' || nflState.week === 0))
  const isDrafting = leagueStatus === 'drafting'

  const statusLabel = leagueStatus
    ? LEAGUE_STATUS_LABEL[leagueStatus] ?? leagueStatus
    : nflState
    ? STATUS_LABEL[nflState.season_type] ?? nflState.season_type
    : 'Pre-Draft'

  if (stateLoading || leagueLoading || rostersLoading) {
    return (
      <div>
        <SectionHeader>Dashboard</SectionHeader>
        <SkeletonLoader rows={4} />
      </div>
    )
  }

  return (
    <div>
      {/* Announcements widget — always shown above the fold if there's content */}
      <AnnouncementsWidget />

      {isPreDraft ? (
        <PreDraftBanner isDrafting={isDrafting} />
      ) : (
        <>
          <SectionHeader>Week {nflState?.week} Matchups</SectionHeader>
          <p className="text-muted text-base mb-8">Matchup board coming soon.</p>
        </>
      )}

      {rosters && (
        <>
          <SectionHeader>League at a Glance</SectionHeader>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-10">
            <Card className="py-5">
              <div className="text-label text-muted uppercase font-sans mb-2">Teams</div>
              <div className="text-numLg tabular text-text font-bold">{rosters.length}</div>
            </Card>
            <Card className="py-5">
              <div className="text-label text-muted uppercase font-sans mb-2">Season</div>
              <div className="text-numLg tabular text-text font-bold">{league?.season ?? '2026'}</div>
            </Card>
            <Card className="py-5">
              <div className="text-label text-muted uppercase font-sans mb-2">Status</div>
              <div className="text-numLg text-gold font-semibold">{statusLabel}</div>
              {isPreDraft && !isDrafting && (
                <div className="text-small text-muted font-medium mt-1">
                  Draft {DRAFT_DATE_DISPLAY}
                </div>
              )}
              {isDrafting && (
                <div className="text-small text-gold font-semibold mt-1">Live now →</div>
              )}
            </Card>
          </div>

          {users && (
            <>
              <GoldRule className="mb-8" />
              <SectionHeader>Managers</SectionHeader>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {users.map((user) => (
                  <div key={user.user_id} className="flex items-center gap-2 p-3 bg-surface border border-borderLow rounded-lg">
                    {user.avatar ? (
                      <img
                        src={`https://sleepercdn.com/avatars/thumbs/${user.avatar}`}
                        alt=""
                        className="w-10 h-10 rounded-md shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-md bg-goldLow shrink-0 flex items-center justify-center">
                        <span className="text-gold text-label font-sans font-bold">
                          {user.display_name[0].toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-base font-semibold text-text truncate">
                        {user.metadata?.team_name || user.display_name}
                      </div>
                      {user.metadata?.team_name && (
                        <div className="text-small text-muted truncate">{user.display_name}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <GoldRule className="my-8" />
          <FaabTracker />

          <GoldRule className="my-8" />
          <TransactionFeed />
        </>
      )}
    </div>
  )
}
