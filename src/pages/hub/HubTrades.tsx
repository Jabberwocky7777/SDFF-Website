import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useHub } from '@/components/hub/HubLayout'
import { getTrades, type TradeView } from '@/api/hub'
import SkeletonLoader from '@/components/ui/SkeletonLoader'
import { EmptyState } from './shared'
import { fmtSigned } from '@/lib/formatters'

function tradeDate(t: TradeView): string {
  if (t.date) {
    return new Date(t.date).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }
  return `${t.season}${t.week != null ? ` · wk ${t.week}` : ''}`
}

export default function HubTrades() {
  const { slug, meta } = useHub()
  const [season, setSeason] = useState<number | 'all'>('all')

  const { data, isLoading } = useQuery({
    queryKey: ['hub', slug, 'trades'],
    queryFn: () => getTrades(slug),
  })

  const seasons = useMemo(
    () => [...new Set((data ?? []).map((t) => t.season))].sort((a, b) => b - a),
    [data],
  )
  const trades = useMemo(
    () => (season === 'all' ? data ?? [] : (data ?? []).filter((t) => t.season === season)),
    [data, season],
  )

  if (isLoading) return <SkeletonLoader rows={6} />

  if (!data || data.length === 0) {
    return (
      <EmptyState>
        No trades recorded for {meta.displayName} yet. They&apos;ll appear here once the league
        starts making deals.
      </EmptyState>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <p className="text-body text-muted">
          {data.length} trade{data.length === 1 ? '' : 's'} — value tracked by what each side&apos;s
          return has actually scored since.
        </p>
        {seasons.length > 1 && (
          <select
            value={season}
            onChange={(e) => setSeason(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="bg-surface border border-borderLow rounded-lg px-3 py-1.5 text-small text-text"
          >
            <option value="all">All seasons</option>
            {seasons.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="space-y-3">
        {trades.map((t) => (
          <Link
            key={t.id}
            to={`/l/${slug}/trades/${t.id}`}
            className="block bg-surface border border-borderLow rounded-lg p-4 hover:border-border transition-colors"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-label text-muted uppercase tracking-[0.05em] font-semibold">
                {tradeDate(t)}
                {t.isOffseason && ' · offseason'}
              </span>
              {t.weeksElapsed > 0 && t.sides.length === 2 && (
                <span
                  className={`font-mono text-small font-semibold ${
                    Math.abs(t.netStartedDiff) < 1
                      ? 'text-mutedLow'
                      : 'text-gold'
                  }`}
                >
                  {fmtSigned(t.netStartedDiff)} pts
                </span>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {t.sides.map((s) => (
                <div key={s.userId}>
                  <div className="text-base font-semibold text-text mb-1">{s.name}</div>
                  <ul className="text-small text-muted space-y-0.5">
                    {s.received.length === 0 && <li className="text-mutedLow italic">nothing recorded</li>}
                    {s.received.map((a, i) => (
                      <li key={i} className="truncate">
                        {a.label}
                        {a.position && <span className="text-mutedLow"> · {a.position}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <p className="text-small text-mutedLow mt-3">{t.headline}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
