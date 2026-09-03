import { useMemo } from 'react'
import type { DraftPickView } from '@/api/hub'

/**
 * A pick counts as injury-shortened when he played well under a full season.
 * 70% of the longest season anyone managed (so ~11 of 17) is loose enough to
 * ignore a rested Week 18 and tight enough to catch a real absence.
 */
const HEALTHY_SHARE = 0.7

export interface ValuePick {
  pick: DraftPickView
  /** Positions missed against expectation. Positive = fell short of his slot. */
  delta: number
  shortened: boolean
}

function rank(picks: DraftPickView[], seasonGames: number | null): ValuePick[] {
  return picks
    .filter((p) => p.posRank != null && p.posDraftOrder != null && p.position)
    .map((p) => ({
      pick: p,
      delta: (p.posRank as number) - (p.posDraftOrder as number),
      shortened:
        p.games != null && seasonGames != null && p.games < seasonGames * HEALTHY_SHARE,
    }))
}

function Row({ entry, seasonGames }: { entry: ValuePick; seasonGames: number | null }) {
  const { pick, delta, shortened } = entry
  const missed = delta > 0
  return (
    <div className="px-4 py-2">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-label text-mutedLow tabular w-11 shrink-0">
          {pick.round}.{String(pick.slot).padStart(2, '0')}
        </span>
        <span className="text-small text-text truncate flex-1" title={pick.playerName ?? ''}>
          {pick.playerName ?? '—'}
          {shortened && (
            <span className="text-gold" title={`Played ${pick.games} of ${seasonGames} games`}>
              *
            </span>
          )}
        </span>
        <span
          className={`font-mono text-label tabular shrink-0 ${
            missed ? 'text-red-300' : 'text-green-300'
          }`}
        >
          {missed ? '+' : ''}
          {delta}
        </span>
      </div>
      <div className="font-mono text-label tabular text-mutedLow pl-[3.25rem]">
        {pick.position}
        {pick.posDraftOrder} → {pick.position}
        {pick.posRank}
        {shortened && seasonGames != null && (
          <span className="text-mutedLow"> · {pick.games} of {seasonGames} games</span>
        )}
      </div>
    </div>
  )
}

function Panel({
  title,
  note,
  entries,
  seasonGames,
  anyShortened,
}: {
  title: string
  note: string
  entries: ValuePick[]
  seasonGames: number | null
  anyShortened: boolean
}) {
  return (
    <div className="bg-surface border border-borderLow rounded-lg">
      <div className="px-4 py-3 border-b border-borderLow">
        <h3 className="text-label text-muted uppercase tracking-[0.06em] font-semibold">{title}</h3>
        <p className="text-label text-mutedLow mt-0.5">{note}</p>
      </div>
      <div className="divide-y divide-borderLow">
        {entries.map((e) => (
          <Row key={e.pick.pickNo} entry={e} seasonGames={seasonGames} />
        ))}
      </div>
      {anyShortened && (
        <p className="px-4 py-2.5 text-label text-mutedLow border-t border-borderLow">
          * missed a chunk of the season — the finish reflects the games he played.
        </p>
      )}
    </div>
  )
}

/**
 * "Where they went vs. where they finished", for the selected draft.
 *
 * Ranking is by positional slippage rather than raw finish: a QB2 taken as the
 * QB1 is a modest miss, while an RB58 taken as the RB14 is the story. The
 * asterisk exists so a season lost to injury isn't read as a bad pick.
 */
export default function DraftValuePanels({
  picks,
  seasonGames,
  count = 10,
  layout = 'stack',
}: {
  picks: DraftPickView[]
  seasonGames: number | null
  count?: number
  /** 'row' puts the two panels side by side — for sitting under a wide board. */
  layout?: 'stack' | 'row'
}) {
  const { worst, best } = useMemo(() => {
    const ranked = rank(picks, seasonGames)
    const byDelta = [...ranked].sort((a, b) => b.delta - a.delta)
    return {
      worst: byDelta.filter((e) => e.delta > 0).slice(0, count),
      best: byDelta
        .filter((e) => e.delta < 0)
        .slice(-count)
        .reverse(),
    }
  }, [picks, seasonGames, count])

  if (worst.length === 0 && best.length === 0) {
    return (
      <div className="bg-surface border border-borderLow rounded-lg p-5">
        <p className="text-small text-muted">
          No season finishes on record for this draft, so there is nothing to compare picks
          against yet.
        </p>
      </div>
    )
  }

  return (
    <div className={layout === 'row' ? 'grid gap-4 lg:grid-cols-2 items-start' : 'space-y-4'}>
      {worst.length > 0 && (
        <Panel
          title="Worst picks"
          note="Finished this far below where he was drafted at his position."
          entries={worst}
          seasonGames={seasonGames}
          anyShortened={worst.some((e) => e.shortened)}
        />
      )}
      {best.length > 0 && (
        <Panel
          title="Best value"
          note="Beat his draft slot by this many spots at his position."
          entries={best}
          seasonGames={seasonGames}
          anyShortened={best.some((e) => e.shortened)}
        />
      )}
    </div>
  )
}
