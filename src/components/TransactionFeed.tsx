import { useState, useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { useRosters } from '@/hooks/useRosters'
import { useUsers } from '@/hooks/useUsers'
import { usePlayers } from '@/hooks/usePlayers'
import { useNflState } from '@/hooks/useNflState'
import { getTeamName } from '@/lib/formatters'
import SkeletonLoader from '@/components/ui/SkeletonLoader'
import type { SleeperTransaction } from '@/types/transactions'
import type { SleeperRoster, SleeperUser } from '@/types/sleeper'
import type { SleeperPlayersMap } from '@/types/sleeper'

const TYPE_BADGE: Record<string, string> = {
  trade:        'bg-gold/20 text-gold border border-gold/30',
  free_agent:   'bg-green-900/30 text-green-400 border border-green-500/30',
  waiver:       'bg-blue-900/30 text-blue-300 border border-blue-500/30',
  commissioner: 'bg-purple-900/30 text-purple-300 border border-purple-500/30',
}

const TYPE_LABEL: Record<string, string> = {
  trade:        'Trade',
  free_agent:   'Add',
  waiver:       'Waiver',
  commissioner: 'Commissioner',
}

function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  if (days >= 7) return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (mins > 0) return `${mins}m ago`
  return 'just now'
}

function getRosterName(rosterId: number, rosters: SleeperRoster[], users: SleeperUser[]): string {
  const r = rosters.find((r) => r.roster_id === rosterId)
  if (!r) return `Team ${rosterId}`
  return getTeamName(r.owner_id, users)
}

function getPlayerName(playerId: string, players: SleeperPlayersMap): string {
  return players[playerId]?.full_name ?? `Player ${playerId}`
}

interface TxCardProps {
  tx: SleeperTransaction
  rosters: SleeperRoster[]
  users: SleeperUser[]
  players: SleeperPlayersMap
  expanded: boolean
  onToggle: () => void
}

function TxCard({ tx, rosters, users, players, expanded, onToggle }: TxCardProps) {
  const badge = TYPE_BADGE[tx.type] ?? TYPE_BADGE.commissioner
  const label = TYPE_LABEL[tx.type] ?? tx.type
  const isTrade = tx.type === 'trade'

  const teamNames = tx.roster_ids.map((id) => getRosterName(id, rosters, users))
  const adds = Object.entries(tx.adds ?? {})
  const drops = Object.entries(tx.drops ?? {})
  const waiver = tx.waiver_budget?.[0]

  return (
    <div className="px-4 py-3 border-b border-borderLow last:border-0">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className={`text-label font-bold px-2 py-0.5 rounded shrink-0 ${badge}`}>{label}</span>
          <span className="text-base font-semibold text-text truncate">{teamNames.join(' ↔ ')}</span>
          {waiver && (
            <span className="text-label text-blue-300 bg-blue-900/20 px-2 py-0.5 rounded shrink-0">
              ${waiver.amount} FAAB
            </span>
          )}
        </div>
        <span className="text-small text-muted shrink-0 whitespace-nowrap">
          {formatRelativeTime(tx.created)}
        </span>
      </div>

      {/* Quick summary */}
      {!isTrade && (
        <div className="mt-1.5 text-small text-muted flex flex-wrap gap-x-3 gap-y-0.5">
          {adds.map(([pid]) => (
            <span key={pid} className="text-green-400">+ {getPlayerName(pid, players)}</span>
          ))}
          {drops.map(([pid]) => (
            <span key={pid} className="text-red-400">− {getPlayerName(pid, players)}</span>
          ))}
        </div>
      )}

      {/* Trade toggle */}
      {isTrade && (
        <>
          <button
            onClick={onToggle}
            className="mt-1.5 text-small text-gold hover:text-gold/80 transition-colors font-medium"
          >
            {expanded ? 'Hide details ↑' : 'Show trade details ↓'}
          </button>
          {expanded && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {tx.roster_ids.map((rosterId) => {
                const name = getRosterName(rosterId, rosters, users)
                const received = adds.filter(([, rid]) => rid === rosterId)
                const gave = drops.filter(([, rid]) => rid === rosterId)
                const picks = tx.draft_picks.filter((p) => p.owner_id === rosterId)
                return (
                  <div key={rosterId} className="bg-surfaceHi border border-borderLow rounded p-3">
                    <div className="text-label text-muted uppercase font-semibold mb-2">{name} receives</div>
                    {received.map(([pid]) => (
                      <div key={pid} className="text-small text-green-400">+ {getPlayerName(pid, players)}</div>
                    ))}
                    {picks.map((p, i) => (
                      <div key={i} className="text-small text-gold">
                        + {p.season} {['1st','2nd','3rd','4th'][p.round - 1] ?? `Rd ${p.round}`}
                      </div>
                    ))}
                    {received.length === 0 && picks.length === 0 && (
                      <div className="text-small text-mutedLow italic">Nothing received</div>
                    )}
                    <div className="border-t border-borderLow mt-2 pt-2">
                      <div className="text-label text-muted uppercase font-semibold mb-1">{name} sends</div>
                      {gave.map(([pid]) => (
                        <div key={pid} className="text-small text-red-400">− {getPlayerName(pid, players)}</div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function TransactionFeed() {
  const { data: nflState } = useNflState()
  const { data: rosters } = useRosters()
  const { data: users } = useUsers()
  const { data: players, isLoading: lp } = usePlayers()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const currentWeek = nflState?.week ?? 0
  const [viewWeek, setViewWeek] = useState<number | null>(null)
  const activeWeek = viewWeek ?? Math.max(1, currentWeek)

  // Fetch last 3 weeks
  const weekNums = [activeWeek, activeWeek - 1, activeWeek - 2].filter((w) => w > 0)

  const queries = useQueries({
    queries: weekNums.map((w) => ({
      queryKey: ['transactions', w],
      queryFn: () => apiFetch<SleeperTransaction[]>(`/league/transactions/${w}`),
      staleTime: 2 * 60 * 1000,
      enabled: w > 0,
    })),
  })

  const allTxns = useMemo(() => {
    return queries
      .flatMap((q) => q.data ?? [])
      .filter((tx) => tx.status === 'complete')
      .sort((a, b) => b.created - a.created)
  }, [queries])

  const isLoading = queries.some((q) => q.isLoading) || lp

  if (currentWeek === 0) {
    return (
      <div>
        <h2 className="font-sans text-h2 font-bold text-text mb-4">Recent Transactions</h2>
        <div className="bg-surface border border-borderLow rounded-lg p-6 text-center">
          <p className="text-base text-muted">Transactions will appear here once the season begins.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="font-sans text-h2 font-bold text-text">Recent Transactions</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewWeek((w) => Math.max(1, (w ?? activeWeek) - 1))}
            disabled={activeWeek <= 1}
            className="text-small font-medium text-muted hover:text-text disabled:opacity-30 transition-colors px-2 py-1"
          >
            ← Wk {activeWeek - 1}
          </button>
          <span className="text-small font-semibold text-text bg-surfaceHi px-3 py-1 rounded">
            Week {activeWeek}
          </span>
          <button
            onClick={() => setViewWeek((w) => Math.min(currentWeek, (w ?? activeWeek) + 1))}
            disabled={activeWeek >= currentWeek}
            className="text-small font-medium text-muted hover:text-text disabled:opacity-30 transition-colors px-2 py-1"
          >
            Wk {activeWeek + 1} →
          </button>
        </div>
      </div>

      {isLoading ? (
        <SkeletonLoader rows={5} />
      ) : allTxns.length === 0 ? (
        <div className="bg-surface border border-borderLow rounded-lg p-6 text-center">
          <p className="text-base text-muted">No transactions found for this period.</p>
        </div>
      ) : (
        <div className="bg-surface border border-borderLow rounded-lg">
          {rosters && users && players && allTxns.map((tx) => (
            <TxCard
              key={tx.transaction_id}
              tx={tx}
              rosters={rosters}
              users={users}
              players={players}
              expanded={expandedId === tx.transaction_id}
              onToggle={() => setExpandedId((id) => id === tx.transaction_id ? null : tx.transaction_id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
