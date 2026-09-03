import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { BracketMatchView, BracketTeam, BracketView } from '@/api/hub'

function placementLabel(placement: number | null): string | null {
  if (placement == null) return null
  if (placement === 1) return 'Championship'
  if (placement === 3) return '3rd place'
  if (placement === 5) return '5th place'
  return `${placement}th place`
}

function Team({
  team,
  fallback,
  slug,
}: {
  team: BracketTeam | null
  /** "winner of 3" while the feeding match is still unresolved. */
  fallback: string | null
  slug: string
}) {
  if (!team) {
    return (
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="text-small text-mutedLow italic truncate">{fallback ?? 'TBD'}</span>
      </div>
    )
  }

  const inner = (
    <>
      <span className="flex items-center gap-2 min-w-0">
        {team.seed != null && (
          <span className="font-mono text-label text-mutedLow tabular w-4 shrink-0">
            {team.seed}
          </span>
        )}
        <span
          className={`text-small truncate ${team.won ? 'text-text font-semibold' : 'text-muted'}`}
        >
          {team.name}
        </span>
      </span>
      <span
        className={`font-mono text-small tabular shrink-0 ${
          team.won ? 'text-gold font-semibold' : 'text-mutedLow'
        }`}
      >
        {team.points != null ? team.points.toFixed(1) : '—'}
      </span>
    </>
  )

  const classes = `flex items-center justify-between gap-2 px-3 py-2 ${
    team.won ? 'bg-goldLow' : ''
  }`

  if (!team.userId) return <div className={classes}>{inner}</div>
  return (
    <Link to={`/l/${slug}/managers/${team.userId}`} className={`${classes} hover:bg-white/5`}>
      {inner}
    </Link>
  )
}

function Match({ match, slug }: { match: BracketMatchView; slug: string }) {
  const label = placementLabel(match.placement)
  return (
    <div className="bg-surface border border-borderLow rounded-lg overflow-hidden">
      {label && (
        <div className="px-3 py-1.5 bg-surfaceHi border-b border-borderLow text-label text-muted uppercase tracking-[0.06em] font-semibold">
          {label}
        </div>
      )}
      <Team team={match.t1} fallback={match.from.t1} slug={slug} />
      <div className="border-t border-borderLow" />
      <Team team={match.t2} fallback={match.from.t2} slug={slug} />
    </div>
  )
}

function Side({ view, slug, empty }: { view: BracketView; slug: string; empty: string }) {
  if (view.rounds.length === 0) {
    return <p className="text-small text-mutedLow px-1 py-3">{empty}</p>
  }
  return (
    // Columns are rounds. Horizontal scroll rather than shrinking, so a
    // four-round bracket stays legible on a phone.
    <div className="overflow-x-auto">
      <div className="flex gap-4 min-w-max pb-1">
        {view.rounds.map((r) => (
          <div key={r.round} className="w-56 shrink-0">
            <div className="text-label text-mutedLow uppercase tracking-[0.06em] font-semibold mb-2">
              Round {r.round}
              {r.week != null && <span className="text-mutedLow/70"> · wk {r.week}</span>}
            </div>
            {/* Centring each column vertically is what makes a bracket read as
                a bracket: later rounds sit between the matches that feed them. */}
            <div className="flex flex-col justify-around gap-3 h-full">
              {r.matches.map((m) => (
                <Match key={m.matchId} match={m} slug={slug} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * One season's playoff bracket. The winners bracket is the story; the
 * consolation/toilet bracket is behind a toggle since most people never want it.
 */
export default function PlayoffBracket({
  winners,
  losers,
  slug,
}: {
  winners: BracketView
  losers: BracketView
  slug: string
}) {
  const [showLosers, setShowLosers] = useState(false)
  const hasLosers = losers.rounds.length > 0

  return (
    <div>
      <Side view={winners} slug={slug} empty="No playoff bracket on record for this season." />

      {hasLosers && (
        <div className="mt-5">
          <button
            onClick={() => setShowLosers((v) => !v)}
            className="text-small font-semibold text-muted hover:text-gold transition-colors"
          >
            {showLosers ? '− Hide' : '+ Show'} consolation bracket
          </button>
          {showLosers && (
            <div className="mt-3">
              <Side view={losers} slug={slug} empty="No consolation bracket on record." />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
