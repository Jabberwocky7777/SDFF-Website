import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useHub } from '@/components/hub/HubLayout'
import { getH2HMatrix, type H2HCell, type H2HRecord } from '@/api/hub'
import SkeletonLoader from '@/components/ui/SkeletonLoader'
import { EmptyState } from './shared'

type Phase = 'combined' | 'regular' | 'playoff'

const PHASE_LABEL: Record<Phase, string> = {
  combined: 'Combined',
  regular: 'Regular season',
  playoff: 'Playoffs',
}

function tone(rec: H2HRecord | undefined): string {
  if (!rec || rec.meetings === 0) return 'text-mutedLow'
  const diff = rec.wins - rec.losses
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
  const [phase, setPhase] = useState<Phase>('combined')

  const { data, isLoading } = useQuery({
    queryKey: ['hub', slug, 'h2h'],
    queryFn: () => getH2HMatrix(slug),
  })

  const hasPlayoffs = useMemo(
    () =>
      !!data &&
      Object.values(data.cells).some((row) =>
        Object.values(row).some((c) => c.playoff.meetings > 0),
      ),
    [data],
  )

  if (isLoading) return <SkeletonLoader rows={10} />
  if (!data || data.managers.length < 2) {
    return <EmptyState>Head-to-head records appear once managers have faced each other.</EmptyState>
  }

  const pick = (cell: H2HCell | undefined): H2HRecord | undefined => cell?.[phase]

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <p className="text-body text-muted max-w-xl">
          Every manager pairing — row beats column. Click a cell for the full game log.
        </p>
        <div className="flex gap-1 bg-surfaceHi border border-borderLow rounded-lg p-1">
          {(['combined', 'regular', 'playoff'] as const)
            .filter((p) => p !== 'playoff' || hasPlayoffs)
            .map((p) => (
              <button
                key={p}
                onClick={() => setPhase(p)}
                className={`px-3 py-1.5 text-small font-semibold rounded-md transition-all ${
                  phase === p ? 'bg-gold text-[#1A1100]' : 'text-muted hover:text-text'
                }`}
              >
                {PHASE_LABEL[p]}
              </button>
            ))}
        </div>
      </div>

      <div className="bg-surface border border-borderLow rounded-lg overflow-x-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 bg-surface z-20 p-2 w-[10rem] min-w-[10rem]" />
              {data.managers.map((m) => (
                <th key={m.userId} className="h-32 p-0 align-bottom" title={m.name}>
                  {/* Names are rotated so full handles fit without the grid
                      sprawling sideways. The wrapper is zero-height so the
                      rotated text overflows upward instead of widening the
                      column. */}
                  <div className="h-0 flex justify-center">
                    <span
                      className={`inline-block origin-bottom-left -rotate-45 translate-x-1 whitespace-nowrap text-small font-semibold ${
                        hover?.b === m.userId ? 'text-gold' : 'text-muted'
                      }`}
                    >
                      {m.name}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.managers.map((rowM) => (
              <tr key={rowM.userId}>
                <th
                  className={`sticky left-0 bg-surface z-10 px-3 py-2 text-left text-small font-semibold whitespace-nowrap w-[10rem] min-w-[10rem] ${
                    hover?.a === rowM.userId ? 'text-gold' : 'text-text'
                  }`}
                >
                  {rowM.name}
                </th>
                {data.managers.map((colM) => {
                  if (rowM.userId === colM.userId) {
                    return <td key={colM.userId} className="bg-white/3 border border-borderLow/40" />
                  }
                  const rec = pick(data.cells[rowM.userId]?.[colM.userId])
                  return (
                    <td
                      key={colM.userId}
                      onMouseEnter={() => setHover({ a: rowM.userId, b: colM.userId })}
                      onMouseLeave={() => setHover(null)}
                      onClick={() =>
                        rec && navigate(`/l/${slug}/head-to-head/${rowM.userId}/vs/${colM.userId}`)
                      }
                      className={`border border-borderLow/40 text-center px-2.5 py-2 font-mono text-num tabular whitespace-nowrap cursor-pointer transition-colors hover:bg-white/5 ${tone(rec)}`}
                    >
                      {rec && rec.meetings > 0
                        ? `${rec.wins}-${rec.losses}${rec.ties ? `-${rec.ties}` : ''}`
                        : '·'}
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
