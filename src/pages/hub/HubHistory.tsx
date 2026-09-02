import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useHub } from '@/components/hub/HubLayout'
import { getTimeline } from '@/api/hub'
import SkeletonLoader from '@/components/ui/SkeletonLoader'
import { EmptyState, Panel } from './shared'

function rankColor(rank: number | null, total: number): string {
  if (rank == null) return 'text-mutedLow'
  if (rank === 1) return 'text-gold font-bold'
  if (rank <= 3) return 'text-text font-semibold'
  if (rank >= total - 1) return 'text-red-400/80'
  return 'text-muted'
}

export default function HubHistory() {
  const { slug, meta } = useHub()
  const { data, isLoading } = useQuery({
    queryKey: ['hub', slug, 'timeline'],
    queryFn: () => getTimeline(slug),
  })

  if (isLoading) return <SkeletonLoader rows={8} />
  if (!data || data.seasons.length === 0) {
    return <EmptyState>No completed seasons yet — the timeline fills in as seasons finish.</EmptyState>
  }

  const maxTotal = Math.max(...meta.seasons.map((s) => s.totalRosters ?? 12))

  return (
    <div className="space-y-8">
      <Panel title="Season-by-season finish">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 bg-surface text-left text-label text-muted uppercase font-semibold px-4 py-3 z-10">
                  Manager
                </th>
                {data.seasons.map((yr) => (
                  <th key={yr} className="text-center text-label text-muted font-semibold px-2 py-3 font-mono">
                    {String(yr).slice(2)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.managers.map((m) => (
                <tr key={m.userId} className="border-t border-borderLow hover:bg-white/3 transition-colors">
                  <td className="sticky left-0 bg-surface px-4 py-2.5 z-10">
                    <Link to={`/l/${slug}/managers/${m.userId}`} className="text-base font-semibold text-text hover:text-gold transition-colors whitespace-nowrap">
                      {m.name}
                    </Link>
                  </td>
                  {data.seasons.map((yr) => {
                    const rank = data.ranks[m.userId]?.[yr] ?? null
                    const isChamp = data.champions[yr] === m.userId
                    return (
                      <td
                        key={yr}
                        className={`text-center px-2 py-2.5 font-mono text-num tabular ${rankColor(rank, maxTotal)} ${isChamp ? 'bg-goldLow' : ''}`}
                      >
                        {rank ?? '·'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-3 text-small text-mutedLow border-t border-borderLow">
          Cell = final placement that season. <span className="text-gold">Gold</span> = champion.
        </p>
      </Panel>

      <Panel title="Seasons">
        <div className="divide-y divide-borderLow">
          {meta.seasons.map((s) => (
            <div key={s.leagueId} className="flex items-center gap-4 px-5 py-4">
              <span className="font-mono text-numLg font-bold text-muted w-16">{s.season}</span>
              <div className="flex-1 min-w-0">
                <div className="text-base text-text">
                  {s.champion ? (
                    <>
                      <span className="text-gold font-semibold">{s.champion.name}</span> def.{' '}
                      <span className="text-muted">{s.runnerUp?.name ?? '—'}</span>
                    </>
                  ) : (
                    <span className="text-muted capitalize">{s.status?.replace('_', ' ') ?? 'pending'}</span>
                  )}
                </div>
                <div className="text-small text-mutedLow mt-0.5">
                  {s.totalRosters ?? '?'} teams
                  {s.capabilities?.hasMedianScoring ? ' · median scoring' : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}
