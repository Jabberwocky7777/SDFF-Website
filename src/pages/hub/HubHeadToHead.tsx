import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useHub } from '@/components/hub/HubLayout'
import { getH2HMatrix, type H2HCell } from '@/api/hub'
import SkeletonLoader from '@/components/ui/SkeletonLoader'
import { EmptyState } from './shared'

function cellTone(cell: H2HCell | undefined): string {
  if (!cell || cell.meetings === 0) return 'text-mutedLow'
  const diff = cell.wins - cell.losses
  if (diff >= 3) return 'text-green-400 font-semibold'
  if (diff > 0) return 'text-green-400/80'
  if (diff <= -3) return 'text-red-400 font-semibold'
  if (diff < 0) return 'text-red-400/80'
  return 'text-muted'
}

export default function HubHeadToHead() {
  const { slug } = useHub()
  const navigate = useNavigate()
  const [hover, setHover] = useState<{ a: string; b: string } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['hub', slug, 'h2h'],
    queryFn: () => getH2HMatrix(slug),
  })

  const initials = useMemo(() => {
    const m = new Map<string, string>()
    data?.managers.forEach((mgr) => {
      m.set(
        mgr.userId,
        mgr.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase(),
      )
    })
    return m
  }, [data])

  if (isLoading) return <SkeletonLoader rows={10} />
  if (!data || data.managers.length < 2) {
    return <EmptyState>Head-to-head records appear once managers have faced each other.</EmptyState>
  }

  return (
    <div>
      <p className="text-body text-muted mb-6 max-w-2xl">
        Career record for every manager pairing. Row beats column. Click any cell for the full game log.
      </p>

      <div className="bg-surface border border-borderLow rounded-lg overflow-x-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 bg-surface z-10 p-2" />
              {data.managers.map((m) => (
                <th
                  key={m.userId}
                  className={`p-2 text-label font-mono font-semibold ${
                    hover?.b === m.userId ? 'text-gold' : 'text-muted'
                  }`}
                  title={m.name}
                >
                  {initials.get(m.userId)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.managers.map((rowM) => (
              <tr key={rowM.userId}>
                <th
                  className={`sticky left-0 bg-surface z-10 px-3 py-2 text-left text-small font-semibold whitespace-nowrap ${
                    hover?.a === rowM.userId ? 'text-gold' : 'text-text'
                  }`}
                >
                  {rowM.name}
                </th>
                {data.managers.map((colM) => {
                  if (rowM.userId === colM.userId) {
                    return <td key={colM.userId} className="bg-white/3 border border-borderLow/40" />
                  }
                  const cell = data.cells[rowM.userId]?.[colM.userId]
                  return (
                    <td
                      key={colM.userId}
                      onMouseEnter={() => setHover({ a: rowM.userId, b: colM.userId })}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => cell && navigate(`/l/${slug}/head-to-head/${rowM.userId}/vs/${colM.userId}`)}
                      className={`border border-borderLow/40 text-center px-2.5 py-2 font-mono text-num tabular cursor-pointer transition-colors hover:bg-white/5 ${cellTone(cell)}`}
                    >
                      {cell && cell.meetings > 0 ? `${cell.wins}-${cell.losses}${cell.ties ? `-${cell.ties}` : ''}` : '·'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
