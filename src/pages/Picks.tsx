import { useMemo } from 'react'
import SkeletonLoader from '@/components/ui/SkeletonLoader'
import { useTradedPicks } from '@/hooks/useTradedPicks'
import { useRosters } from '@/hooks/useRosters'
import { useUsers } from '@/hooks/useUsers'
import { duesRecords } from '@/data/dues'
import { getTeamName } from '@/lib/formatters'
import type { TradedPick } from '@/types/picks'
import type { SleeperRoster, SleeperUser } from '@/types/sleeper'

const PICK_SEASONS = ['2027', '2028', '2029']
const ROUNDS = [1, 2, 3, 4]
const ROUND_LABEL = ['1st', '2nd', '3rd', '4th']

function getRosterName(
  rosterId: number,
  rosters: SleeperRoster[],
  users: SleeperUser[],
): string {
  const roster = rosters.find((r) => r.roster_id === rosterId)
  if (!roster) return `Roster ${rosterId}`
  return getTeamName(roster.owner_id, users)
}

function getDuesStatus(managerName: string, season: string): boolean {
  const rec = duesRecords.find((d) => d.managerName === managerName)
  return rec?.payments[season] === 'paid'
}

interface PickCellProps {
  season: string
  round: number
  tradedPicks: TradedPick[]
  rosters: SleeperRoster[]
  users: SleeperUser[]
}

function PickCell({ season, round, tradedPicks, rosters, users }: PickCellProps) {
  const trade = tradedPicks.find(
    (p) => p.season === season && p.round === round,
  )

  if (!trade) {
    return <span className="text-muted text-small italic">Held</span>
  }

  const originalOwner = getRosterName(trade.previous_owner_id, rosters, users)
  const currentOwner = getRosterName(trade.roster_id, rosters, users)

  const originalDuesPaid = getDuesStatus(originalOwner, season)
  const currentDuesPaid = getDuesStatus(currentOwner, season)
  const duesWarning = !originalDuesPaid || !currentDuesPaid

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-muted text-label truncate">{originalOwner}</span>
        <span className="text-mutedLow text-label">→</span>
        <span className="text-gold text-label font-semibold truncate">{currentOwner}</span>
      </div>
      {duesWarning && (
        <span
          className="text-label text-orange-400 bg-orange-900/20 px-1.5 py-0.5 rounded"
          title="Dues required before this pick can be traded"
        >
          ⚠ Dues required
        </span>
      )}
    </div>
  )
}

export default function Picks() {
  const { data: tradedPicks, isLoading, isError, refetch } = useTradedPicks()
  const { data: rosters } = useRosters()
  const { data: users } = useUsers()

  // Chronological trade log (newest first)
  const tradeLog = useMemo(() => {
    if (!tradedPicks || !rosters || !users) return []
    return [...tradedPicks]
      .filter((p) => p.roster_id !== p.previous_owner_id)
      .map((p) => ({
        ...p,
        fromName: getRosterName(p.previous_owner_id, rosters, users),
        toName: getRosterName(p.roster_id, rosters, users),
      }))
      .sort((a, b) => Number(b.season) - Number(a.season) || a.round - b.round)
  }, [tradedPicks, rosters, users])

  if (isLoading || !rosters || !users) {
    return (
      <div>
        <h1 className="font-sans text-h1 sm:text-hero font-bold text-text mb-8">Traded Picks</h1>
        <SkeletonLoader rows={8} />
      </div>
    )
  }

  if (isError) {
    return (
      <div>
        <h1 className="font-sans text-h1 sm:text-hero font-bold text-text mb-4">Traded Picks</h1>
        <div className="bg-surface border border-red-500/30 rounded-lg p-6 text-center">
          <p className="text-base text-muted mb-3">Failed to load traded picks.</p>
          <button
            onClick={() => void refetch()}
            className="text-small font-semibold text-gold hover:text-gold/80 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-sans text-h1 sm:text-hero font-bold text-text mb-2">Traded Picks</h1>
        <p className="text-body text-muted leading-relaxed max-w-2xl">
          Future rookie pick ownership. Picks shown in gold have been traded. A ⚠ warning appears when
          dues for that season haven't been paid — both managers must pay before such picks can be traded.
        </p>
      </div>

      {/* ── Pick Ownership Grid ─────────────────────────────────────────────── */}
      {PICK_SEASONS.map((season) => (
        <section key={season}>
          <h2 className="font-sans text-h2 font-bold text-text mb-4">{season} Picks</h2>
          <div className="bg-surface border border-borderLow rounded-lg overflow-x-auto">
            {/* Header */}
            <div className="grid bg-surfaceHi border-b border-borderLow"
                 style={{ gridTemplateColumns: '5rem 1fr' }}>
              <div className="px-4 py-3 text-label text-muted uppercase tracking-[0.04em] font-semibold">Round</div>
              <div className="px-4 py-3 text-label text-muted uppercase tracking-[0.04em] font-semibold">Current Owner</div>
            </div>

            {ROUNDS.map((round) => (
              <div
                key={round}
                className="grid border-b border-borderLow last:border-0 hover:bg-white/3 transition-colors"
                style={{ gridTemplateColumns: '5rem 1fr' }}
              >
                <div className="px-4 py-3 flex items-center">
                  <span className="font-mono text-num text-text font-bold">{ROUND_LABEL[round - 1]}</span>
                </div>
                <div className="px-4 py-3 flex items-center">
                  <PickCell
                    season={season}
                    round={round}
                    tradedPicks={tradedPicks ?? []}
                    rosters={rosters}
                    users={users}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* ── Trade Log ──────────────────────────────────────────────────────── */}
      <section>
        <h2 className="font-sans text-h2 font-bold text-text mb-4">Pick Trade Log</h2>
        {tradeLog.length === 0 ? (
          <div className="bg-surface border border-borderLow rounded-lg p-6 text-center">
            <p className="text-base text-muted">No pick trades recorded yet.</p>
          </div>
        ) : (
          <div className="bg-surface border border-borderLow rounded-lg divide-y divide-borderLow">
            {tradeLog.map((entry, i) => (
              <div key={i} className="px-5 py-3 flex items-center gap-3 flex-wrap">
                <span className="font-mono text-label text-gold font-bold shrink-0">
                  {entry.season} {ROUND_LABEL[(entry.round ?? 1) - 1]}
                </span>
                <span className="text-base text-text">
                  <span className="text-muted">{entry.fromName}</span>
                  {' → '}
                  <span className="font-semibold">{entry.toName}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="bg-surface border border-borderLow rounded-lg p-5">
        <div className="text-label uppercase font-bold text-muted mb-2">Training Wheels Note</div>
        <p className="text-base text-muted leading-relaxed">
          Rookie pick trading is <span className="text-text font-semibold">not allowed until after the 2027 rookie draft</span>.
          All Training Wheels restrictions (3-asset cap, 48-hour review window, pick trading ban) expire once the 2027 rookie draft concludes.
        </p>
      </div>
    </div>
  )
}
