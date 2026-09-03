import { useQuery } from '@tanstack/react-query'
import { useHub } from '@/components/hub/HubLayout'
import { getRecords } from '@/api/hub'
import SkeletonLoader from '@/components/ui/SkeletonLoader'
import { EmptyState } from './shared'

export default function HubRecords() {
  const { slug, meta } = useHub()
  const { data, isLoading } = useQuery({
    queryKey: ['hub', slug, 'records'],
    queryFn: () => getRecords(slug),
  })

  const scope = meta.seasons.filter((s) => s.status === 'complete').length <= 1
    ? `${meta.seasons[0]?.season ?? ''} records`
    : 'All-time records'

  if (isLoading) return <SkeletonLoader rows={8} />
  if (!data || data.length === 0) {
    return <EmptyState>Records show up once games have been played.</EmptyState>
  }

  // The server appends a note entry when it had to leave games out; it carries
  // prose rather than a value, so it belongs under the grid, not in it.
  const cards = data.filter((r) => !r.note)
  const notes = data.filter((r) => r.note)

  return (
    <div>
      <p className="text-label text-muted uppercase tracking-[0.06em] font-semibold mb-4">{scope}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {cards.map((r) => (
          <div key={r.label} className="bg-surface border border-borderLow rounded-lg p-4">
            <div className="text-label text-muted uppercase tracking-[0.05em] font-semibold mb-2">
              {r.label}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-numLg font-bold text-gold tabular">
                {Number.isInteger(r.value) ? r.value : r.value.toFixed(2)}
              </span>
              {r.name && <span className="text-base font-semibold text-text truncate">{r.name}</span>}
            </div>
            <div className="text-small text-mutedLow mt-1">
              {[
                r.detail,
                r.span,
                r.season != null ? `${r.season}${r.week != null ? ` · wk ${r.week}` : ''}` : null,
              ]
                .filter(Boolean)
                .join('  ·  ')}
            </div>
          </div>
        ))}
      </div>
      {notes.map((n) => (
        <p key={n.label} className="text-small text-mutedLow mt-4">
          {n.note}
        </p>
      ))}
    </div>
  )
}
