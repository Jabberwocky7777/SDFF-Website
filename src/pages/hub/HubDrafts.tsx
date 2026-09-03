import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useHub } from '@/components/hub/HubLayout'
import { getDraftBoard, getDraftSeasons, type DraftPickView } from '@/api/hub'
import SkeletonLoader from '@/components/ui/SkeletonLoader'
import { EmptyState } from './shared'
import ScrollTable from './ScrollTable'
import SeasonPills from './SeasonPills'
import DraftValuePanels from './DraftValuePanels'
import { useFullscreen } from '@/hooks/useFullscreen'

const POS_TONE: Record<string, string> = {
  QB: 'text-red-300',
  RB: 'text-green-300',
  WR: 'text-blue-300',
  TE: 'text-yellow-300',
  K: 'text-muted',
  DEF: 'text-muted',
}

type Density = 'comfortable' | 'compact'
const DENSITY_KEY = 'sdff_draft_density'

/**
 * What one column actually costs, per density, in px. Comfortable is
 * content-sized, so this is measured rather than derived from `min-w`; compact
 * uses a fixed table layout and holds this width exactly.
 */
const COL_PX: Record<Density, number> = { comfortable: 158, compact: 104 }
const ROUND_COL_PX = 45

/**
 * Remembered choice wins. With no choice on record, start in whichever density
 * actually fits the whole board on this screen — the point of the board is
 * seeing every team at once, and 12 teams at comfortable width needs ~1900px.
 */
function loadDensity(teams: number): Density {
  try {
    const saved = localStorage.getItem(DENSITY_KEY)
    if (saved === 'compact' || saved === 'comfortable') return saved
  } catch {
    /* private mode — fall through to the fitted default */
  }
  if (typeof window === 'undefined' || !teams) return 'comfortable'
  const available = window.innerWidth - ROUND_COL_PX
  return teams * COL_PX.comfortable <= available ? 'comfortable' : 'compact'
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

function ordinalSuffix(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return 'th'
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
}

function finishTitle(pick: DraftPickView): string {
  if (pick.posRank == null || !pick.position) return pick.playerName ?? ''
  const drafted =
    pick.posDraftOrder != null
      ? ` — ${pick.posDraftOrder}${ordinalSuffix(pick.posDraftOrder)} ${pick.position} drafted`
      : ''
  return `${pick.playerName ?? ''} · finished ${pick.position}${pick.posRank} that season${drafted}`
}

function Cell({ pick, density }: { pick: DraftPickView | undefined; density: Density }) {
  if (!pick) return <td className="border border-borderLow/40 bg-white/[0.02]" />
  const compact = density === 'compact'
  const last = pick.playerName?.split(' ').slice(1).join(' ') || pick.playerName || '—'
  const first = pick.playerName?.split(' ')[0] ?? ''
  return (
    <td
      className={`border border-borderLow/40 align-top overflow-hidden ${
        compact ? 'px-1.5 py-0.5 min-w-[6.5rem]' : 'px-2 py-1.5 min-w-[9.5rem]'
      }`}
      title={compact ? finishTitle(pick) : undefined}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={`text-label font-bold shrink-0 ${POS_TONE[pick.position ?? ''] ?? 'text-mutedLow'}`}
        >
          {pick.position ?? '?'}
        </span>
        <span
          className={`${compact ? 'text-label' : 'text-small'} text-text truncate`}
          title={pick.playerName ?? ''}
        >
          <span className="text-mutedLow">{first ? `${first[0]}. ` : ''}</span>
          {last}
        </span>
      </div>
      <div className="text-label text-mutedLow mt-0.5 flex items-center gap-1">
        <span>#{pick.pickNo}</span>
        {pick.isKeeper && <span className="text-gold">K</span>}
        {pick.viaTrade && (
          <span className="text-blue-300/70" title={`picked by ${pick.managerName}`}>
            ⇄
          </span>
        )}
        {compact && pick.posRank != null && pick.position && (
          <span className={`font-mono tabular ${finishTone(pick.posRank, pick.posDraftOrder)}`}>
            {pick.position}
            {pick.posRank}
          </span>
        )}
      </div>
      {!compact && pick.posRank != null && pick.position && (
        <div
          className={`text-label mt-0.5 font-mono tabular ${finishTone(pick.posRank, pick.posDraftOrder)}`}
          title={finishTitle(pick)}
        >
          {pick.position}
          {pick.posRank}
          {pick.seasonPoints != null && (
            <span className="text-mutedLow"> · {pick.seasonPoints.toFixed(1)}</span>
          )}
        </div>
      )}
    </td>
  )
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-small font-semibold rounded-md transition-all whitespace-nowrap ${
        active ? 'bg-gold text-[#1A1100]' : 'text-muted hover:text-text'
      }`}
    >
      {children}
    </button>
  )
}

export default function HubDrafts() {
  const { slug, meta } = useHub()
  const [season, setSeason] = useState<number | null>(null)
  const [density, setDensity] = useState<Density | null>(null)
  const board_ = useFullscreen<HTMLDivElement>()

  useEffect(() => {
    if (!density) return
    try {
      localStorage.setItem(DENSITY_KEY, density)
    } catch {
      /* private mode — the toggle still works for this session */
    }
  }, [density])

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

  // An explicit choice wins; otherwise fit to this screen once the board tells
  // us how many teams there are. Derived rather than stored, so it stays right
  // when the window resizes before the user has picked.
  const teams = board.data?.slots.length ?? 0
  const effectiveDensity: Density = density ?? (teams ? loadDensity(teams) : 'comfortable')

  if (seasons.isLoading) return <SkeletonLoader rows={8} />
  if (!seasons.data || seasons.data.length === 0) {
    return <EmptyState>No draft results on record for {meta.displayName} yet.</EmptyState>
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <p className="text-body text-muted max-w-xl">
          Every completed draft — <span className="text-gold">K</span> = keeper,{' '}
          <span className="text-blue-300/80">⇄</span> = pick made by another manager. The second
          line is where the player finished at his position that season, in this league&rsquo;s
          scoring.
        </p>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-surfaceHi border border-borderLow rounded-lg p-1">
            <Toggle active={effectiveDensity === 'comfortable'} onClick={() => setDensity('comfortable')}>
              Comfortable
            </Toggle>
            <Toggle active={effectiveDensity === 'compact'} onClick={() => setDensity('compact')}>
              Compact
            </Toggle>
          </div>
          <button
            onClick={board_.toggle}
            className="hidden sm:block px-3 py-2 text-small font-semibold rounded-lg bg-surfaceHi border border-borderLow text-muted hover:text-gold transition-colors"
            title="Fullscreen board (Esc to exit)"
          >
            {board_.active ? 'Exit fullscreen' : 'Fullscreen'}
          </button>
        </div>
      </div>

      <SeasonPills
        seasons={seasons.data.map((s) => s.season)}
        value={activeSeason}
        onChange={setSeason}
        className="mb-5"
      />

      {board.isLoading || !board.data ? (
        <SkeletonLoader rows={10} />
      ) : (
        <>
          {/* Board (sm and up). Full-bleed so 12 columns fit without panning,
              with both axes pinned so the round number and the team never
              scroll out from under you. */}
          <div className="hidden sm:block">
            {/* The toolbar button is covered while the overlay is up, so the
                overlay carries its own way out. */}
            {board_.active && (
              <button
                onClick={board_.toggle}
                className="fixed top-4 right-5 z-[60] px-3 py-1.5 text-small font-semibold rounded-md bg-surfaceHi border border-borderLow text-muted hover:text-gold transition-colors"
              >
                Exit fullscreen · Esc
              </button>
            )}
            <ScrollTable
              bleed={!board_.active}
              frameRef={board_.ref}
              maxHeight={board_.active ? '100vh' : 'calc(100vh - 17rem)'}
              className={board_.expanded ? 'fixed inset-0 z-50 rounded-none' : ''}
            >
              <table
                className={`border-collapse text-left ${
                  effectiveDensity === 'compact' ? 'table-fixed w-full' : ''
                }`}
              >
                <thead>
                  <tr>
                    <th className="sticky left-0 top-0 z-30 bg-surface px-3 py-2 text-label text-mutedLow uppercase">
                      Rd
                    </th>
                    {board.data.slots.map((s) => (
                      <th
                        key={s.slot}
                        className="sticky top-0 z-20 bg-surface px-2 py-2 text-label font-semibold text-muted truncate max-w-[9rem]"
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
                      <th className="sticky left-0 z-10 bg-surface px-3 py-1.5 text-num font-mono text-mutedLow tabular">
                        {r + 1}
                      </th>
                      {row.map((pick, c) => (
                        <Cell key={c} pick={pick} density={effectiveDensity} />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollTable>
          </div>

          {/* Underneath rather than beside the board: a side rail stole ~340px
              and pushed the board back into horizontal scrolling, which is the
              thing the full-bleed layout exists to avoid. */}
          {!board_.active && (
            <div className="mt-6">
              <DraftValuePanels
                picks={board.data.picks}
                seasonGames={board.data.seasonGames}
                layout="row"
              />
            </div>
          )}

          {/* Below sm, panning an 1800px grid is miserable — read it by round. */}
          <div className="sm:hidden space-y-4">
            {grid.map((row, r) => (
              <div key={r} className="bg-surface border border-borderLow rounded-lg">
                <div className="px-4 py-2 border-b border-borderLow text-label text-muted uppercase tracking-[0.06em] font-semibold">
                  Round {r + 1}
                </div>
                <div className="divide-y divide-borderLow">
                  {row.map((pick, c) => (
                    <div key={c} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="font-mono text-label text-mutedLow tabular w-8 shrink-0">
                        {pick ? `#${pick.pickNo}` : '—'}
                      </span>
                      <span className="text-small text-mutedLow truncate w-24 shrink-0">
                        {board.data!.slots[c]?.name}
                      </span>
                      {pick ? (
                        <span className="text-small text-text truncate flex-1">
                          <span
                            className={`font-bold mr-1.5 ${POS_TONE[pick.position ?? ''] ?? 'text-mutedLow'}`}
                          >
                            {pick.position ?? '?'}
                          </span>
                          {pick.playerName ?? '—'}
                        </span>
                      ) : (
                        <span className="text-small text-mutedLow flex-1">—</span>
                      )}
                      {pick?.posRank != null && pick.position && (
                        <span
                          className={`font-mono text-label tabular shrink-0 ${finishTone(pick.posRank, pick.posDraftOrder)}`}
                        >
                          {pick.position}
                          {pick.posRank}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
