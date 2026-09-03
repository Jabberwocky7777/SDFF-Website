import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useHub } from '@/components/hub/HubLayout'
import { getDraftBoard, getDraftSeasons, type DraftPickView } from '@/api/hub'
import SkeletonLoader from '@/components/ui/SkeletonLoader'
import { EmptyState } from './shared'

const POS_TONE: Record<string, string> = {
  QB: 'text-red-300',
  RB: 'text-green-300',
  WR: 'text-blue-300',
  TE: 'text-yellow-300',
  K: 'text-muted',
  DEF: 'text-muted',
}

/**
 * How the season finish compares to where the player went at his position.
 * Beating your draft slot by a couple of spots is noise; the tones only kick in
 * once a pick clearly worked out or clearly didn't.
 */
function finishTone(posRank: number, posDraftOrder: number | null): string {
  if (posDraftOrder == null) return 'text-mutedLow'
  const delta = posDraftOrder - posRank
  if (delta >= 6) return 'text-green-300'
  if (delta <= -6) return 'text-red-300'
  return 'text-mutedLow'
}

function Cell({ pick }: { pick: DraftPickView | undefined }) {
  if (!pick) return <td className="border border-borderLow/40 bg-white/[0.02]" />
  const last = pick.playerName?.split(' ').slice(1).join(' ') || pick.playerName || '—'
  const first = pick.playerName?.split(' ')[0] ?? ''
  return (
    <td className="border border-borderLow/40 px-2 py-1.5 align-top min-w-[9.5rem]">
      <div className="flex items-center gap-1.5">
        <span className={`text-label font-bold shrink-0 ${POS_TONE[pick.position ?? ''] ?? 'text-mutedLow'}`}>
          {pick.position ?? '?'}
        </span>
        <span className="text-small text-text truncate" title={pick.playerName ?? ''}>
          <span className="text-mutedLow">{first ? `${first[0]}. ` : ''}</span>
          {last}
        </span>
      </div>
      <div className="text-label text-mutedLow mt-0.5 flex items-center gap-1">
        <span>#{pick.pickNo}</span>
        {pick.isKeeper && <span className="text-gold">K</span>}
        {pick.viaTrade && <span className="text-blue-300/70" title={`picked by ${pick.managerName}`}>⇄</span>}
      </div>
      {pick.posRank != null && pick.position && (
        <div
          className={`text-label mt-0.5 font-mono tabular ${finishTone(pick.posRank, pick.posDraftOrder)}`}
          title={`Finished ${pick.position}${pick.posRank} that season${
            pick.posDraftOrder != null ? ` — ${pick.posDraftOrder}${ordinalSuffix(pick.posDraftOrder)} ${pick.position} drafted` : ''
          }`}
        >
          {pick.position}
          {pick.posRank}
          {pick.seasonPoints != null && <span className="text-mutedLow"> · {pick.seasonPoints.toFixed(1)}</span>}
        </div>
      )}
    </td>
  )
}

function ordinalSuffix(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return 'th'
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
}

export default function HubDrafts() {
  const { slug, meta } = useHub()
  const [season, setSeason] = useState<number | null>(null)

  const seasons = useQuery({
    queryKey: ['hub', slug, 'draft-seasons'],
    queryFn: () => getDraftSeasons(slug),
  })

  const activeSeason = season ?? seasons.data?.[0]?.season ?? null

  const board = useQuery({
    queryKey: ['hub', slug, 'draft-board', activeSeason],
    queryFn: () => getDraftBoard(slug, activeSeason as number),
    enabled: activeSeason != null,
  })

  const grid = useMemo(() => {
    if (!board.data) return []
    const bySlot = new Map<string, DraftPickView>()
    for (const p of board.data.picks) bySlot.set(`${p.round}:${p.slot}`, p)
    return Array.from({ length: board.data.rounds }, (_, r) =>
      board.data!.slots.map((s) => bySlot.get(`${r + 1}:${s.slot}`)),
    )
  }, [board.data])

  if (seasons.isLoading) return <SkeletonLoader rows={8} />
  if (!seasons.data || seasons.data.length === 0) {
    return <EmptyState>No draft results on record for {meta.displayName} yet.</EmptyState>
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <p className="text-body text-muted">
          Every completed draft — <span className="text-gold">K</span> = keeper,{' '}
          <span className="text-blue-300/80">⇄</span> = pick made by another manager. The second
          line is where the player finished at his position that season, in this league's scoring.
        </p>
        <div className="flex gap-1 bg-surfaceHi border border-borderLow rounded-lg p-1 overflow-x-auto max-w-full">
          {seasons.data.map((s) => (
            <button
              key={s.season}
              onClick={() => setSeason(s.season)}
              className={`px-3 py-1.5 text-small font-semibold rounded-md transition-all whitespace-nowrap ${
                s.season === activeSeason ? 'bg-gold text-[#1A1100]' : 'text-muted hover:text-text'
              }`}
            >
              {s.season}
            </button>
          ))}
        </div>
      </div>

      {board.isLoading || !board.data ? (
        <SkeletonLoader rows={10} />
      ) : (
        <div className="bg-surface border border-borderLow rounded-lg overflow-x-auto">
          <table className="border-collapse text-left">
            <thead>
              <tr>
                <th className="sticky left-0 bg-surface z-10 px-3 py-2 text-label text-mutedLow uppercase">
                  Rd
                </th>
                {board.data.slots.map((s) => (
                  <th
                    key={s.slot}
                    className="px-2 py-2 text-label font-semibold text-muted truncate max-w-[9rem]"
                    title={s.name}
                  >
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((row, r) => (
                <tr key={r}>
                  <th className="sticky left-0 bg-surface z-10 px-3 py-1.5 text-num font-mono text-mutedLow tabular">
                    {r + 1}
                  </th>
                  {row.map((pick, c) => (
                    <Cell key={c} pick={pick} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
