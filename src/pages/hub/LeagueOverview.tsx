import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useHub } from '@/components/hub/HubLayout'
import { getMatchupWeeks, getStandings, getWeekMatchups } from '@/api/hub'
import SkeletonLoader from '@/components/ui/SkeletonLoader'
import { Panel, Stat } from './shared'
import { fmtRecord } from '@/lib/formatters'

export default function LeagueOverview() {
  const { slug, meta } = useHub()
  const { data: allTime, isLoading } = useQuery({
    queryKey: ['hub', slug, 'standings', 'all'],
    queryFn: () => getStandings(slug),
  })

  // The most recent week on record — "this week" once a season is running,
  // and the last game played otherwise. SDFF has none yet, hence the guards.
  const weeks = useQuery({
    queryKey: ['hub', slug, 'matchup-weeks'],
    queryFn: () => getMatchupWeeks(slug),
  })
  const latestWeek = weeks.data?.[0]
    ? { season: weeks.data[0].season, week: weeks.data[0].weeks[weeks.data[0].weeks.length - 1] }
    : null
  const recent = useQuery({
    queryKey: ['hub', slug, 'matchups', latestWeek?.season, latestWeek?.week],
    queryFn: () => getWeekMatchups(slug, latestWeek!.season, latestWeek!.week),
    enabled: latestWeek != null,
  })

  const completed = meta.seasons.filter((s) => s.status === 'complete')
  const latest = meta.seasons[0]
  const totalGames = (allTime ?? []).reduce((s, r) => s + r.wins + r.losses + r.ties, 0) / 2

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Seasons" value={meta.seasons.length} sub={completed.length ? `${completed.length} complete` : undefined} />
        <Stat label="Managers" value={(allTime ?? []).length || '—'} />
        <Stat label="Games played" value={totalGames ? Math.round(totalGames) : '—'} />
        <Stat
          label="Current season"
          value={latest?.season ?? '—'}
          sub={latest?.status?.replace('_', ' ')}
        />
      </div>

      {latestWeek && recent.data && recent.data.games.length > 0 && (
        <Panel
          title={`${latestWeek.season} · week ${latestWeek.week}`}
          right={
            <Link
              to={`/l/${slug}/matchups`}
              className="text-small text-muted hover:text-gold transition-colors"
            >
              All matchups →
            </Link>
          }
        >
          <div className="divide-y divide-borderLow">
            {recent.data.games.slice(0, 6).map((g, i) => (
              <div
                key={g.matchupId ?? `solo-${g.home.rosterId}-${i}`}
                className="flex items-center gap-3 px-5 py-2.5 text-small"
              >
                <span className="flex-1 truncate text-text">{g.home.name}</span>
                <span className="font-mono text-num tabular text-muted w-16 text-right">
                  {g.home.points.toFixed(1)}
                </span>
                <span className="text-mutedLow w-6 text-center">
                  {g.away ? 'vs' : '—'}
                </span>
                <span className="font-mono text-num tabular text-muted w-16">
                  {g.away ? g.away.points.toFixed(1) : ''}
                </span>
                <span className="flex-1 truncate text-text">{g.away?.name ?? 'Bye'}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
      {/* Champions strip */}
      {completed.length > 0 && (
        <Panel title="Champions">
          <div className="divide-y divide-borderLow">
            {completed.map((s) => (
              <div key={s.leagueId} className="flex items-center justify-between px-5 py-3">
                <span className="font-mono text-num text-muted tabular">{s.season}</span>
                <span className="font-sans text-base font-semibold text-text">
                  {s.champion?.name ?? '—'}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Career leaders */}
      <Panel
        title="Career leaders"
        right={
          <Link to={`/l/${slug}/standings`} className="text-small text-muted hover:text-gold transition-colors">
            Full table →
          </Link>
        }
      >
        {isLoading ? (
          <div className="p-5"><SkeletonLoader rows={5} /></div>
        ) : (
          <div className="divide-y divide-borderLow">
            {(allTime ?? []).slice(0, 6).map((r, i) => (
              <Link
                key={r.userId}
                to={`/l/${slug}/managers/${r.userId}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-white/3 transition-colors"
              >
                <span className="font-mono text-num text-mutedLow w-5 text-center">{i + 1}</span>
                <span className="font-sans text-base font-semibold text-text flex-1 truncate">{r.name}</span>
                {r.championships > 0 && (
                  <span className="text-label text-gold font-semibold">
                    {r.championships}× 🏆
                  </span>
                )}
                <span className="font-mono text-num tabular text-muted w-16 text-right">
                  {fmtRecord(r.wins, r.losses, r.ties)}
                </span>
                <span className="font-mono text-num tabular text-text w-14 text-right">
                  {(r.winPct * 100).toFixed(0)}%
                </span>
              </Link>
            ))}
          </div>
        )}
      </Panel>
      </div>
    </div>
  )
}
