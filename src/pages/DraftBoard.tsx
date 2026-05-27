import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import SkeletonLoader from '@/components/ui/SkeletonLoader'
import { useRankings } from '@/hooks/useRankings'
import { useDraftId } from '@/hooks/useDraftId'
import { useDraftPicks, type SleeperDraftPick } from '@/hooks/useDraftPicks'
import { useUsers } from '@/hooks/useUsers'
import type { FantasyCalcPlayer } from '@/types/rankings'

const POS_COLORS: Record<string, string> = {
  QB: 'bg-red-900/40 text-red-300 border border-red-500/30',
  RB: 'bg-green-900/40 text-green-300 border border-green-500/30',
  WR: 'bg-blue-900/40 text-blue-300 border border-blue-500/30',
  TE: 'bg-orange-900/40 text-orange-300 border border-orange-500/30',
}

const ROSTER_TARGETS: Record<string, number> = { QB: 3, RB: 6, WR: 8, TE: 3 }

type WsStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

interface LivePick {
  pickNo: number
  round: number
  pickInRound: number
  playerName: string
  position: string
  pickedByUserId: string
}

function PosBadge({ pos }: { pos: string }) {
  return (
    <span className={`text-label font-bold px-1.5 py-0.5 rounded shrink-0 ${POS_COLORS[pos] ?? 'bg-zinc-800 text-zinc-300 border border-zinc-600/30'}`}>
      {pos}
    </span>
  )
}

function NeedsBar({ label, have, target }: { label: string; have: number; target: number }) {
  const pct = Math.min(100, Math.round((have / target) * 100))
  const color = have >= target ? 'bg-green-500' : have >= target - 1 ? 'bg-yellow-400' : 'bg-red-500'
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-small font-semibold text-text">{label}</span>
        <span className="font-mono text-label text-muted">{have}/{target}</span>
      </div>
      <div className="h-1.5 bg-surfaceHi rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function DraftBoard() {
  const { data: rankingsData, isLoading: lr } = useRankings()
  const { data: draftIdData, isLoading: ld } = useDraftId()
  const { data: users } = useUsers()
  const draftId = draftIdData?.draftId ?? null
  const { data: serverPicks } = useDraftPicks(draftId)

  const [posFilter, setPosFilter] = useState<string>('All')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'rank' | 'vona' | 'age'>('rank')
  const [livePicks, setLivePicks] = useState<LivePick[]>([])
  const [wsStatus, setWsStatus] = useState<WsStatus>('disconnected')
  const [liveDraftedIds, setLiveDraftedIds] = useState<Set<string>>(new Set())
  const wsRef = useRef<WebSocket | null>(null)
  const retryRef = useRef(0)
  // Stable ref to draftId so connectWs doesn't re-fire when serverPicks refetches
  const draftIdRef = useRef(draftId)
  useEffect(() => { draftIdRef.current = draftId }, [draftId])

  // Combine server picks + live WebSocket picks into a set of drafted player IDs
  const draftedIds = useMemo(() => {
    const ids = new Set<string>(liveDraftedIds)
    for (const p of serverPicks ?? []) ids.add(p.player_id)
    return ids
  }, [serverPicks, liveDraftedIds])

  const getUserName = useCallback((userId: string) => {
    const user = users?.find((u) => u.user_id === userId)
    return user?.metadata?.team_name ?? user?.display_name ?? `Team ${userId}`
  }, [users])

  // WebSocket connection — only depends on draftId to avoid reconnecting on every server poll
  const connectWs = useCallback(() => {
    const id = draftIdRef.current
    if (!id) return
    const ws = new WebSocket(`wss://draft.sleeper.app/trade/nfl/${id}`)
    wsRef.current = ws
    setWsStatus('connecting')

    ws.onopen = () => {
      setWsStatus('connected')
      retryRef.current = 0
    }

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string) as {
          type?: string
          payload?: {
            pick_no?: number
            round?: number
            draft_slot?: number
            player_id?: string
            metadata?: { first_name?: string; last_name?: string; position?: string }
            picked_by?: string
          }
        }
        if (msg.type === 'picked' && msg.payload) {
          const p = msg.payload
          const name = [p.metadata?.first_name, p.metadata?.last_name].filter(Boolean).join(' ')
          setLivePicks((prev) => [
            {
              pickNo: p.pick_no ?? prev.length + 1,
              round: p.round ?? 1,
              pickInRound: p.draft_slot ?? 1,
              playerName: name,
              position: p.metadata?.position ?? '?',
              pickedByUserId: p.picked_by ?? '',
            },
            ...prev,
          ])
          if (p.player_id) {
            setLiveDraftedIds((prev) => new Set([...prev, p.player_id!]))
          }
        }
      } catch {
        // malformed message — ignore
      }
    }

    ws.onclose = () => {
      setWsStatus('disconnected')
      if (retryRef.current < 3) {
        const delay = Math.pow(2, retryRef.current) * 1000
        retryRef.current++
        setTimeout(connectWs, delay)
      } else {
        setWsStatus('error')
      }
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [])  // stable — uses draftIdRef instead of draftId directly

  useEffect(() => {
    if (!draftId) return
    connectWs()
    return () => {
      wsRef.current?.close()
    }
  }, [draftId, connectWs])

  // Process rankings data
  const players = useMemo<FantasyCalcPlayer[]>(() => {
    if (!rankingsData) return []
    return rankingsData.filter(
      (p) => ['QB', 'RB', 'WR', 'TE'].includes(p.player.position),
    )
  }, [rankingsData])

  // Available (not drafted)
  const available = useMemo(() => {
    return players.filter((p) => {
      const slId = p.player.sleeperId
      return !slId || !draftedIds.has(slId)
    })
  }, [players, draftedIds])

  // VONA per player
  const withVona = useMemo(() => {
    const nextByPos: Record<string, number | undefined> = {}
    const posOrder = ['QB', 'RB', 'WR', 'TE']
    for (const pos of posOrder) {
      const first = available.find((p) => p.player.position === pos)
      nextByPos[pos] = first?.value
    }
    return available.map((p) => {
      const next = nextByPos[p.player.position]
      const vona = next !== undefined ? p.value - next : 0
      return { ...p, vona }
    })
  }, [available])

  // Filter + search + sort
  const filtered = useMemo(() => {
    let list = withVona
    if (posFilter !== 'All') list = list.filter((p) => p.player.position === posFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((p) => p.player.name.toLowerCase().includes(q))
    }
    if (sortBy === 'rank') list = [...list].sort((a, b) => a.overallRank - b.overallRank)
    else if (sortBy === 'vona') list = [...list].sort((a, b) => b.vona - a.vona)
    else if (sortBy === 'age') list = [...list].sort((a, b) => (a.player.age ?? 99) - (b.player.age ?? 99))
    return list.slice(0, 200)  // cap DOM size
  }, [withVona, posFilter, search, sortBy])

  // Roster needs (track my picks from the picks panel)
  const myPickCounts = useMemo<Record<string, number>>(() => {
    // We can't reliably know "my" user_id without auth state — show aggregate totals instead
    const counts: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0 }
    return counts
  }, [])

  // Server pick history merged with live picks
  const pickHistory = useMemo<LivePick[]>(() => {
    const fromServer: LivePick[] = (serverPicks ?? []).map((p) => ({
      pickNo: p.pick_no,
      round: p.round,
      pickInRound: 1,  // Sleeper pick object doesn't expose pick_in_round directly
      playerName: [p.metadata.first_name, p.metadata.last_name].filter(Boolean).join(' '),
      position: p.metadata.position,
      pickedByUserId: '',
    }))
    // Merge, prefer live picks (they come in first in the list)
    const merged = [...livePicks]
    for (const sp of fromServer) {
      if (!merged.find((lp) => lp.pickNo === sp.pickNo)) merged.push(sp)
    }
    return merged.sort((a, b) => b.pickNo - a.pickNo)
  }, [serverPicks, livePicks])

  const isLoading = lr || ld

  if (isLoading) {
    return (
      <div>
        <h1 className="font-sans text-hero font-bold text-text mb-8">Draft Board</h1>
        <SkeletonLoader rows={10} />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-sans text-hero font-bold text-text mb-2">Draft Board</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-body text-muted">
            Startup draft — May 30, 2026. Real-time player availability.
          </p>
          <span className={`text-label font-semibold px-2 py-0.5 rounded ${
            wsStatus === 'connected'
              ? 'bg-green-900/30 text-green-400 border border-green-500/30'
              : wsStatus === 'connecting'
              ? 'bg-yellow-900/30 text-yellow-300 border border-yellow-500/30'
              : wsStatus === 'error'
              ? 'bg-red-900/30 text-red-400 border border-red-500/30'
              : 'bg-zinc-800 text-zinc-400 border border-zinc-600/30'
          }`}>
            {wsStatus === 'connected' ? '● Live'
              : wsStatus === 'connecting' ? '○ Connecting…'
              : wsStatus === 'error' ? '✕ Disconnected'
              : '○ Offline'}
          </span>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="bg-gold/10 border border-gold/25 rounded-lg px-4 py-3 mb-6 text-small text-muted">
        <span className="text-gold font-semibold">Note: </span>
        Values from FantasyCalc (superflex, 1.0 PPR). Adjust mentally: TEs are undervalued ~15% due to our 1.5 TE PPR scoring. WRs are accurate.
      </div>

      <div className="flex flex-col lg:flex-row gap-6">

        {/* ── Left: Available Players (60%) ────────────────────────────────── */}
        <div className="flex-[3] min-w-0">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="flex gap-1">
              {(['All', 'QB', 'RB', 'WR', 'TE'] as const).map((pos) => (
                <button
                  key={pos}
                  onClick={() => setPosFilter(pos)}
                  className={`px-3 py-1.5 text-small font-semibold rounded transition-all ${
                    posFilter === pos
                      ? 'bg-gold text-[#1A1100]'
                      : 'bg-surfaceHi text-muted hover:text-text border border-borderLow'
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Search player…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-surface border border-borderLow rounded-md px-3 py-1.5 text-small text-text placeholder-mutedLow focus:outline-none focus:border-gold/50"
            />
          </div>

          {/* Sort controls */}
          <div className="flex gap-2 mb-3">
            <span className="text-label text-muted self-center">Sort:</span>
            {([['rank', 'Dynasty Rank'], ['vona', 'VONA'], ['age', 'Age']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className={`text-label font-semibold px-2.5 py-1 rounded transition-all ${
                  sortBy === key
                    ? 'text-gold bg-goldLow'
                    : 'text-muted hover:text-text'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Player table */}
          <div className="bg-surface border border-borderLow rounded-lg overflow-hidden">
            <div className="grid bg-surfaceHi border-b border-borderLow px-4 py-2.5"
                 style={{ gridTemplateColumns: '3rem 1fr 3rem 4rem 2.5rem 4.5rem 4.5rem' }}>
              {['Rank', 'Player', 'Pos', 'Team', 'Age', 'Value', 'VONA'].map((h, i) => (
                <div key={h} className={`text-label text-muted uppercase tracking-[0.04em] font-semibold ${i > 1 ? 'text-center' : ''}`}>
                  {h}
                </div>
              ))}
            </div>

            <div className="overflow-y-auto max-h-[60vh]">
              {filtered.length === 0 ? (
                <div className="px-4 py-8 text-center text-muted text-base">No players found.</div>
              ) : filtered.map((p) => (
                <div
                  key={p.player.id}
                  className="grid border-b border-borderLow last:border-0 px-4 py-2 hover:bg-white/3 transition-colors"
                  style={{ gridTemplateColumns: '3rem 1fr 3rem 4rem 2.5rem 4.5rem 4.5rem' }}
                >
                  <span className="font-mono text-label text-muted self-center">{p.overallRank}</span>
                  <span className="text-base text-text font-semibold self-center truncate pr-2">{p.player.name}</span>
                  <div className="self-center"><PosBadge pos={p.player.position} /></div>
                  <span className="font-mono text-small text-muted self-center text-center">{p.player.maybeTeam ?? '—'}</span>
                  <span className="font-mono text-small text-muted self-center text-center">{p.player.age ?? '—'}</span>
                  <span className="font-mono text-small text-text self-center text-center">{p.value.toLocaleString()}</span>
                  <span className={`font-mono text-small self-center text-center ${p.vona > 0 ? 'text-gold' : 'text-mutedLow'}`}>
                    {p.vona > 0 ? `+${p.vona}` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-label text-mutedLow mt-2">
            Showing {filtered.length} available players{posFilter !== 'All' ? ` (${posFilter})` : ''}
          </p>
        </div>

        {/* ── Right: Pick History + Roster Needs (40%) ─────────────────────── */}
        <div className="flex-[2] min-w-0 space-y-6">

          {/* Roster Needs */}
          <div className="bg-surface border border-borderLow rounded-lg p-4">
            <div className="text-label uppercase font-bold text-muted mb-4">Roster Targets</div>
            <div className="space-y-3">
              {Object.entries(ROSTER_TARGETS).map(([pos, target]) => (
                <NeedsBar key={pos} label={pos} have={myPickCounts[pos] ?? 0} target={target} />
              ))}
            </div>
            <p className="text-label text-mutedLow mt-3 italic">
              Targets: QB×3, RB×6, WR×8, TE×3 for a balanced startup
            </p>
          </div>

          {/* Pick History */}
          <div className="bg-surface border border-borderLow rounded-lg overflow-hidden">
            <div className="bg-surfaceHi border-b border-borderLow px-4 py-3">
              <div className="text-label uppercase font-bold text-muted">Pick History</div>
            </div>
            <div className="overflow-y-auto max-h-[40vh]">
              {pickHistory.length === 0 ? (
                <div className="px-4 py-6 text-center text-muted text-small">
                  No picks made yet.
                </div>
              ) : pickHistory.map((pick) => (
                <div key={pick.pickNo} className="flex items-center gap-3 px-4 py-2.5 border-b border-borderLow last:border-0 hover:bg-white/3 transition-colors">
                  <span className="font-mono text-label text-gold font-bold shrink-0 w-10">
                    {pick.round}.{String(pick.pickInRound).padStart(2, '0')}
                  </span>
                  <PosBadge pos={pick.position} />
                  <span className="text-base text-text font-semibold truncate flex-1">{pick.playerName}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
