import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useHub } from '@/components/hub/HubLayout'
import { getH2HMatrix, type H2HCell, type H2HRecord } from '@/api/hub'
import SkeletonLoader from '@/components/ui/SkeletonLoader'
import { EmptyState } from './shared'
import ScrollTable from './ScrollTable'

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

function fmt(rec: H2HRecord | undefined): string {
  if (!rec || rec.meetings === 0) return '·'
  return `${rec.wins}-${rec.losses}${rec.ties ? `-${rec.ties}` : ''}`
}

export default function HubHeadToHead() {
  const { slug } = useHub()
  const navigate = useNavigate()
  const [hover, setHover] = useState<{ a: string; b: string } | null>(null)
  const [phase, setPhase] = useState<Phase>('combined')
  const [focus, setFocus] = useState<string | null>(null)

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
  const focused = focus ?? data.managers[0].userId

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

      {/* Matrix (sm and up). Column labels are vertical rather than rotated 45°:
          vertical text occupies a real box, so the header row sizes itself to the
          longest name instead of overflowing a fixed height and sliding left
          underneath the sticky corner cell. */}
      <div className="hidden sm:block">
        <ScrollTable bleed maxHeight="calc(100vh - 15rem)">
          <table className="border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-30 bg-surface p-2 w-[10rem] min-w-[10rem]" />
                {data.managers.map((m) => (
                  <th
                    key={m.userId}
                    className="sticky top-0 z-20 bg-surface p-0 align-bottom"
                    title={m.name}
                  >
                    <div
                      className={`mx-auto py-2 max-h-[11rem] overflow-hidden [writing-mode:vertical-rl] rotate-180 text-small font-semibold whitespace-nowrap ${
                        hover?.b === m.userId ? 'text-gold' : 'text-muted'
                      }`}
                    >
                      {m.name}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.managers.map((rowM) => (
                <tr key={rowM.userId}>
                  <th
                    className={`sticky left-0 z-10 bg-surface px-3 py-2 text-left text-small font-semibold whitespace-nowrap w-[10rem] min-w-[10rem] ${
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
                        {fmt(rec)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTable>
      </div>

      {/* Below sm a 12×12 grid is unreadable, so pick one manager and read their
          row as a list. */}
      <div className="sm:hidden">
        <select
          value={focused}
          onChange={(e) => setFocus(e.target.value)}
          aria-label="Manager"
          className="w-full bg-surfaceHi border border-borderLow rounded-lg px-3 py-2.5 text-base text-text mb-3"
        >
          {data.managers.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name}
            </option>
          ))}
        </select>
        <div className="bg-surface border border-borderLow rounded-lg divide-y divide-borderLow">
          {data.managers
            .filter((m) => m.userId !== focused)
            .map((m) => {
              const rec = pick(data.cells[focused]?.[m.userId])
              return (
                <Link
                  key={m.userId}
                  to={`/l/${slug}/head-to-head/${focused}/vs/${m.userId}`}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <span className="text-base text-text">vs. {m.name}</span>
                  <span className={`font-mono text-num tabular ${tone(rec)}`}>{fmt(rec)}</span>
                </Link>
              )
            })}
        </div>
      </div>
    </div>
  )
}
