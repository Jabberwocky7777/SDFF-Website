import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useHub } from '@/components/hub/HubLayout'
import { getPowerRankings } from '@/api/hub'
import SkeletonLoader from '@/components/ui/SkeletonLoader'
import { DeltaArrow, EmptyState } from './shared'
import { fmtPct } from '@/lib/formatters'

export default function HubPowerRankings() {
  const { slug } = useHub()
  const { data, isLoading } = useQuery({
    queryKey: ['hub', slug, 'power'],
    queryFn: () => getPowerRankings(slug),
  })

  if (isLoading) return <SkeletonLoader rows={10} />
  if (!data || data.rankings.length === 0) {
    return <EmptyState>Power rankings need at least two weeks of a season played.</EmptyState>
  }

  return (
    <div>
      <p className="text-label text-muted uppercase tracking-[0.06em] font-semibold mb-4">
        {data.season} season · through week {data.throughWeek}
      </p>
      <div className="bg-surface border border-borderLow rounded-lg divide-y divide-borderLow">
        {data.rankings.map((r) => (
          <div key={r.userId} className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 hover:bg-white/3 transition-colors">
            <div className="font-mono text-numLg font-bold text-muted w-7 shrink-0 text-center">{r.rank}</div>
            <div className="w-10 shrink-0 text-center"><DeltaArrow movement={r.movement} /></div>
            <div className="flex-1 min-w-0">
              <Link to={`/l/${slug}/managers/${r.userId}`} className="font-sans text-h3 font-semibold text-text hover:text-gold transition-colors">
                {r.name}
              </Link>
              <div className="text-small text-muted mt-0.5">
                {r.record} · {r.seasonPpg.toFixed(1)} ppg · {fmtPct(r.allPlayWinPct)} all-play
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-mono text-num font-bold text-gold tabular">{r.recentPpg.toFixed(1)}</div>
              <div className="text-label text-mutedLow">last 3 wk</div>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-small text-mutedLow leading-relaxed">
        Blend of recent form (last 3 weeks), season scoring average, and schedule-independent
        all-play win rate. Arrows show movement vs. last week.
      </p>
    </div>
  )
}
