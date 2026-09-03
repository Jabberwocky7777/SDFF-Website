import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useHub } from '@/components/hub/HubLayout'
import { getMatchupWeeks, getWeekMatchups, type MatchupGame, type MatchupSide } from '@/api/hub'
import SkeletonLoader from '@/components/ui/SkeletonLoader'
import { EmptyState } from './shared'
import SeasonPills from './SeasonPills'

function Score({ side, winner }: { side: MatchupSide; winner: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <div
          className={`text-base font-semibold truncate ${winner ? 'text-text' : 'text-muted'}`}
        >
          {side.name}
        </div>
        {side.teamName && (
          <div className="text-label text-mutedLow truncate">{side.teamName}</div>
        )}
      </div>
      <span
        className={`font-mono text-num tabular shrink-0 ${winner ? 'text-gold font-semibold' : 'text-muted'}`}
      >
        {side.points.toFixed(2)}
      </span>
    </div>
  )
}

function GameCard({ game, slug }: { game: MatchupGame; slug: string }) {
  const { home, away, h2h } = game
  const homeWon = !!away && game.final && home.points > away.points
  const awayWon = !!away && game.final && away.points > home.points

  const tag = game.isConsolation
    ? { label: 'Consolation', tone: 'text-mutedLow' }
    : game.isPlayoff
      ? { label: 'Playoffs', tone: 'text-gold' }
      : null

  const body = (
    <div className="bg-surface border border-borderLow rounded-lg p-4 h-full">
      {(tag || game.bye) && (
        <div className="flex items-center justify-between mb-2">
          <span className={`text-label uppercase tracking-[0.06em] font-semibold ${tag?.tone ?? ''}`}>
            {tag?.label}
          </span>
          {game.bye && (
            <span className="text-label text-mutedLow uppercase tracking-[0.06em] font-semibold">
              Bye
            </span>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Score side={home} winner={homeWon} />
        {away ? (
          <>
            <div className="border-t border-borderLow" />
            <Score side={away} winner={awayWon} />
          </>
        ) : (
          <p className="text-small text-mutedLow">No opponent this week.</p>
        )}
      </div>

      {h2h && (
        <div className="mt-3 pt-3 border-t border-borderLow flex items-center justify-between">
          <span className="text-label text-mutedLow uppercase tracking-[0.06em] font-semibold">
            All-time
          </span>
          <span className="font-mono text-small tabular text-muted">
            {h2h.meetings === 0 ? (
              'First meeting'
            ) : (
              <>
                {h2h.wins}-{h2h.losses}
                {h2h.ties ? `-${h2h.ties}` : ''}{' '}
                <span className="text-mutedLow">to {home.name}</span>
              </>
            )}
          </span>
        </div>
      )}

      {!game.final && !game.bye && (
        <p className="text-label text-mutedLow mt-3">In progress.</p>
      )}
    </div>
  )

  // Only a real pairing has a game log to link to.
  if (!away || !home.userId || !away.userId) return body
  return (
    <Link
      to={`/l/${slug}/head-to-head/${home.userId}/vs/${away.userId}`}
      className="block transition-colors hover:brightness-125"
    >
      {body}
    </Link>
  )
}

function WeekStrip({
  weeks,
  value,
  onChange,
  playoffWeekStart,
}: {
  weeks: number[]
  value: number | null
  onChange: (w: number) => void
  playoffWeekStart: number | null
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {weeks.map((w) => {
        const playoff = playoffWeekStart != null && w >= playoffWeekStart
        return (
          <button
            key={w}
            onClick={() => onChange(w)}
            title={playoff ? 'Playoff week' : undefined}
            className={`w-10 py-1.5 text-small font-semibold rounded-md border transition-colors font-mono tabular ${
              w === value
                ? 'bg-gold text-[#1A1100] border-gold'
                : `bg-surface text-muted hover:text-text hover:border-border ${
                    playoff ? 'border-border' : 'border-borderLow'
                  }`
            }`}
          >
            {w}
          </button>
        )
      })}
    </div>
  )
}

/**
 * A week's slate, with each pairing's all-time series underneath it — the point
 * being that "Klau vs NineMonkeys" means more when you can see they have met
 * once before.
 */
export default function HubMatchups() {
  const { slug, meta } = useHub()
  const [season, setSeason] = useState<number | null>(null)
  const [week, setWeek] = useState<number | null>(null)

  const weeksQuery = useQuery({
    queryKey: ['hub', slug, 'matchup-weeks'],
    queryFn: () => getMatchupWeeks(slug),
  })

  const activeSeason = season ?? weeksQuery.data?.[0]?.season ?? null
  const seasonEntry = useMemo(
    () => weeksQuery.data?.find((s) => s.season === activeSeason) ?? null,
    [weeksQuery.data, activeSeason],
  )
  // Default to the latest week on record — for a live season that is the one in
  // progress, and for a finished one it is the final.
  const activeWeek = week ?? seasonEntry?.weeks[seasonEntry.weeks.length - 1] ?? null

  const games = useQuery({
    queryKey: ['hub', slug, 'matchups', activeSeason, activeWeek],
    queryFn: () => getWeekMatchups(slug, activeSeason as number, activeWeek as number),
    enabled: activeSeason != null && activeWeek != null,
  })

  if (weeksQuery.isLoading) return <SkeletonLoader rows={6} />
  if (!weeksQuery.data || weeksQuery.data.length === 0) {
    return (
      <EmptyState>
        No games on record for {meta.displayName} yet — matchups appear once the season kicks off.
      </EmptyState>
    )
  }

  return (
    <div>
      <p className="text-body text-muted max-w-xl mb-5">
        Every game from a given week, with how the two managers have fared against each other
        across the league&rsquo;s whole history.
      </p>

      <SeasonPills
        seasons={weeksQuery.data.map((s) => s.season)}
        value={activeSeason}
        onChange={(s) => {
          setSeason(s)
          setWeek(null)
        }}
        className="mb-3"
      />

      {seasonEntry && seasonEntry.playoffWeekStart != null && (
        <p className="text-label text-mutedLow mb-2">
          Weeks from {seasonEntry.playoffWeekStart} on are playoff weeks.
        </p>
      )}

      {seasonEntry && (
        <WeekStrip
          weeks={seasonEntry.weeks}
          value={activeWeek}
          onChange={setWeek}
          playoffWeekStart={seasonEntry.playoffWeekStart}
        />
      )}

      <div className="mt-6">
        {games.isLoading || !games.data ? (
          <SkeletonLoader rows={6} />
        ) : games.data.games.length === 0 ? (
          <EmptyState>Nothing recorded for that week.</EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {games.data.games.map((g, i) => (
              <GameCard key={g.matchupId ?? `solo-${g.home.rosterId}-${i}`} game={g} slug={slug} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
