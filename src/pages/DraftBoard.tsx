import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useDraftData, type EnrichedPlayer, type DynastyProfile } from '@/hooks/useDraftData'
import { parseFlockCsv } from '@/lib/parseFlockCsv'
import { apiFetch } from '@/api/client'
import SkeletonLoader from '@/components/ui/SkeletonLoader'
import type { Position } from '@/lib/parseFlockCsv'

// ── Constants ─────────────────────────────────────────────────────────────────

const POS_COLORS: Record<string, string> = {
  QB: 'bg-red-900/40 text-red-300 border border-red-500/30',
  RB: 'bg-blue-900/40 text-blue-300 border border-blue-500/30',
  WR: 'bg-green-900/40 text-green-300 border border-green-500/30',
  TE: 'bg-yellow-900/40 text-yellow-300 border border-yellow-500/30',
}

const TIER_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  S: { text: 'text-yellow-300',  bg: 'bg-yellow-900/20',  border: 'border-yellow-500/40' },
  A: { text: 'text-emerald-300', bg: 'bg-emerald-900/20', border: 'border-emerald-500/40' },
  B: { text: 'text-blue-300',    bg: 'bg-blue-900/20',    border: 'border-blue-500/40' },
  C: { text: 'text-purple-300',  bg: 'bg-purple-900/20',  border: 'border-purple-500/40' },
  D: { text: 'text-orange-300',  bg: 'bg-orange-900/20',  border: 'border-orange-500/40' },
  E: { text: 'text-red-300',     bg: 'bg-red-900/20',     border: 'border-red-500/40' },
  F: { text: 'text-rose-400',    bg: 'bg-rose-900/20',    border: 'border-rose-500/40' },
  G: { text: 'text-zinc-400',    bg: 'bg-zinc-800/40',    border: 'border-zinc-600/40' },
}
const TIER_COLOR_DEFAULT = { text: 'text-zinc-400', bg: 'bg-zinc-800/40', border: 'border-zinc-600/40' }

// Positional roster targets derived from the 34-man SF roster (QB×4, RB×9, WR×12, TE×3)
const ROSTER_TARGETS: Record<Position, number> = { QB: 4, RB: 9, WR: 12, TE: 3 }

const POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE']

const LS_LIVE     = 'sdff_live_draft_id'
const LS_MOCK     = 'sdff_mock_draft_id'
const LS_FLOCK_TS = 'sdff_flock_updated_at'
const LS_ROSTER   = 'sdff_my_roster_id'

type View     = 'value' | 'board' | 'drafted' | 'mine'
type PosFilter = 'ALL' | Position
type SortKey  = 'flockValue' | 'mockAdpValue' | 'flockRank' | 'mockAdp' | 'sleeperSearchRank' | 'wentAt'

// ── Sub-components ────────────────────────────────────────────────────────────

function PosBadge({ pos }: { pos: string }) {
  return (
    <span className={`text-label font-bold px-1.5 py-0.5 rounded shrink-0 ${POS_COLORS[pos] ?? 'bg-zinc-800 text-zinc-300 border border-zinc-600/30'}`}>
      {pos}
    </span>
  )
}

function ProfileBadge({ profile }: { profile: DynastyProfile | null }) {
  if (!profile) return null
  const cfg: Record<DynastyProfile, { label: string; cls: string }> = {
    rebuild:  { label: '↑ Rebuild',  cls: 'bg-blue-900/40 text-blue-300 border-blue-500/30' },
    balanced: { label: '~ Balanced', cls: 'bg-amber-900/30 text-amber-300 border-amber-500/30' },
    allin:    { label: '↓ Win Now',  cls: 'bg-orange-900/40 text-orange-300 border-orange-500/30' },
  }
  const { label, cls } = cfg[profile]
  return (
    <span className={`text-[10px] font-semibold px-1 py-px rounded border leading-none ${cls}`}>
      {label}
    </span>
  )
}

function ValueCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-mutedLow">—</span>
  const display = value === 0 ? '0' : value > 0 ? `+${value}` : String(value)
  if (value > 0) return <span className="text-emerald-400 font-mono font-semibold">{display}</span>
  if (value < 0) return <span className="font-mono text-mutedLow">{display}</span>
  return <span className="font-mono text-muted">{display}</span>
}

function StatusPill({ status }: { status: string | null }) {
  if (status === 'drafting') {
    return (
      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-label font-bold bg-green-900/40 text-green-400 border border-green-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        LIVE
      </span>
    )
  }
  if (status === 'pre_draft') {
    return (
      <span className="px-2.5 py-1 rounded-full text-label font-bold bg-yellow-900/30 text-yellow-300 border border-yellow-500/30">
        PRE-DRAFT
      </span>
    )
  }
  if (status === 'complete') {
    return (
      <span className="px-2.5 py-1 rounded-full text-label font-bold bg-zinc-800 text-zinc-400 border border-zinc-600/30">
        COMPLETE
      </span>
    )
  }
  return null
}

// ── CSV upload zone ───────────────────────────────────────────────────────────

type UploadState = 'idle' | 'ready' | 'uploading' | 'success' | 'error'

function CsvUploadZone({ playerCount, onUploaded }: { playerCount: number; onUploaded: () => void }) {
  const [dragOver, setDragOver]       = useState(false)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [uploadMsg, setUploadMsg]     = useState('')
  const [preview, setPreview]         = useState<{ count: number; csv: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const lastUpdated = localStorage.getItem(LS_FLOCK_TS)
  const lastUpdatedLabel = lastUpdated
    ? new Date(Number(lastUpdated)).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—'

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) {
      setUploadState('error')
      setUploadMsg('File must be a .csv')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      try {
        const players = parseFlockCsv(text)
        setPreview({ count: players.length, csv: text })
        setUploadState('ready')
        setUploadMsg('')
      } catch (err) {
        setUploadState('error')
        setUploadMsg(err instanceof Error ? err.message : 'Invalid CSV')
        setPreview(null)
      }
    }
    reader.readAsText(file)
  }, [])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  const doUpload = async () => {
    if (!preview) return
    setUploadState('uploading')
    try {
      const result = await apiFetch<{ success: boolean; count: number }>('/flock-rankings', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: preview.csv,
      })
      localStorage.setItem(LS_FLOCK_TS, String(Date.now()))
      setUploadState('success')
      setUploadMsg(`✓ Updated — ${result.count} players loaded`)
      setPreview(null)
      onUploaded()
    } catch (err) {
      setUploadState('error')
      setUploadMsg(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  const borderClass = dragOver
    ? 'border-gold bg-gold/5'
    : uploadState === 'error'
    ? 'border-red-500/50 bg-red-900/5'
    : uploadState === 'success'
    ? 'border-green-500/50 bg-green-900/5'
    : 'border-borderLow hover:border-gold/40'

  return (
    <div className="mt-4">
      <div className="text-label text-muted uppercase font-semibold mb-2 tracking-wide">Flock Rankings CSV</div>
      <div
        className={`border-2 border-dashed rounded-lg px-5 py-4 text-center cursor-pointer transition-all ${borderClass}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={onFileChange} />
        {uploadState === 'ready' && preview ? (
          <p className="text-base text-text font-semibold">Ready to upload: {preview.count} players</p>
        ) : (
          <p className="text-base text-muted">
            Drop new Flock rankings CSV here <span className="text-mutedLow">or click to browse</span>
          </p>
        )}
        <p className="text-label text-mutedLow mt-1">
          Current: {playerCount} players · Last updated: {lastUpdatedLabel}
        </p>
      </div>
      {uploadState === 'ready' && preview && (
        <button
          onClick={(e) => { e.stopPropagation(); void doUpload() }}
          className="mt-2 px-4 py-1.5 bg-gold text-[#1A1100] text-small font-bold rounded hover:bg-gold/90 transition-colors"
        >
          Upload {preview.count} players
        </button>
      )}
      {uploadState === 'uploading' && <p className="mt-2 text-small text-muted">Uploading…</p>}
      {(uploadState === 'success' || uploadState === 'error') && uploadMsg && (
        <p className={`mt-2 text-small ${uploadState === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
          {uploadMsg}
        </p>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DraftBoard() {
  const [liveDraftId, setLiveDraftId] = useState(
    () => localStorage.getItem(LS_LIVE) ?? (import.meta.env.VITE_LIVE_DRAFT_ID as string | undefined) ?? '',
  )
  const [mockDraftId, setMockDraftId] = useState(
    () => localStorage.getItem(LS_MOCK) ?? (import.meta.env.VITE_MOCK_DRAFT_ID as string | undefined) ?? '',
  )
  const [myRosterId, setMyRosterId] = useState<number | null>(() => {
    const v = localStorage.getItem(LS_ROSTER)
    return v ? Number(v) : null
  })

  const [liveInput,   setLiveInput]   = useState(liveDraftId)
  const [mockInput,   setMockInput]   = useState(mockDraftId)
  const [rosterInput, setRosterInput] = useState(myRosterId != null ? String(myRosterId) : '')
  const [configOpen,  setConfigOpen]  = useState(false)

  const [view,        setViewState]   = useState<View>('value')
  const [posFilter,   setPosFilter]   = useState<PosFilter>('ALL')
  const [sortKey,     setSortKey]     = useState<SortKey>('flockValue')
  const [sortDir,     setSortDir]     = useState<'asc' | 'desc'>('desc')
  const [search,      setSearch]      = useState('')
  const [needsToggle, setNeedsToggle] = useState(false)

  const { players, recentPicks, currentPickNo, draftStatus, totalPicks, lastRefresh, isLoading, isFetching, error, refresh, reloadFlockRankings } =
    useDraftData({ liveDraftId, mockDraftId })

  // ── Countdown ───────────────────────────────────────────────────────────────

  const [countdown, setCountdown] = useState(30)

  useEffect(() => { setCountdown(30) }, [lastRefresh])

  useEffect(() => {
    if (!liveDraftId) return
    const id = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000)
    return () => clearInterval(id)
  }, [liveDraftId])

  // ── Config handlers ─────────────────────────────────────────────────────────

  const applyLiveDraftId = () => {
    const v = liveInput.trim(); localStorage.setItem(LS_LIVE, v); setLiveDraftId(v)
  }
  const applyMockDraftId = () => {
    const v = mockInput.trim(); localStorage.setItem(LS_MOCK, v); setMockDraftId(v)
  }
  const applyRosterId = () => {
    const n = rosterInput.trim() ? Number(rosterInput.trim()) : null
    if (n != null && !isNaN(n)) {
      localStorage.setItem(LS_ROSTER, String(n)); setMyRosterId(n)
    } else {
      localStorage.removeItem(LS_ROSTER); setMyRosterId(null)
    }
  }

  // ── Positional need ─────────────────────────────────────────────────────────

  // Count picks already made by the user's roster
  const myCounts = useMemo<Record<Position, number>>(() => {
    const counts: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0 }
    if (myRosterId == null) return counts
    for (const p of players) {
      if (!p.available && p.draftedByRosterId === myRosterId) {
        counts[p.position]++
      }
    }
    return counts
  }, [players, myRosterId])

  // How many picks ahead/behind target for each position
  const needBonusFor = useCallback((pos: Position): number => {
    if (!needsToggle || myRosterId == null) return 0
    const target = ROSTER_TARGETS[pos]
    const have   = myCounts[pos]
    const deficit  = Math.max(0, target - have)
    const surplus  = Math.max(0, have - target)
    return deficit * 1.0 - surplus * 2.0
  }, [myCounts, needsToggle, myRosterId])

  // Effective sort value: raw flock value adjusted for positional need
  const effectiveValue = useCallback((p: EnrichedPlayer): number => {
    return p.flockValue + needBonusFor(p.position)
  }, [needBonusFor])

  // ── Sorting ─────────────────────────────────────────────────────────────────

  const handleSort = (key: SortKey, defaultDir: 'asc' | 'desc' = 'desc') => {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(defaultDir) }
  }

  const sortIndicator = (key: SortKey) =>
    sortKey !== key
      ? <span className="text-mutedLow ml-0.5">↕</span>
      : <span className="text-gold ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>

  // Auto-sort when switching views
  const setView = (v: View) => {
    setViewState(v)
    if (v === 'board')                          { setSortKey('flockRank');  setSortDir('asc') }
    else if (v === 'drafted' || v === 'mine')   { setSortKey('wentAt');    setSortDir('asc') }
    else                                        { setSortKey('flockValue'); setSortDir('desc') }
  }

  // ── Filtered + sorted list ──────────────────────────────────────────────────

  const filtered = useMemo<EnrichedPlayer[]>(() => {
    let list = players

    if (view === 'value')        list = list.filter((p) => p.available && p.flockValue >= -10)
    else if (view === 'board')   list = list.filter((p) => p.available)
    else if (view === 'drafted') list = list.filter((p) => !p.available)
    else if (view === 'mine')    list = list.filter((p) => !p.available && p.draftedByRosterId === myRosterId)

    if (posFilter !== 'ALL') list = list.filter((p) => p.position === posFilter)

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q))
    }

    return [...list].sort((a, b) => {
      let av: number, bv: number
      switch (sortKey) {
        case 'flockValue':
          // When needs toggle is on, sort by need-adjusted value
          av = effectiveValue(a); bv = effectiveValue(b); break
        case 'mockAdpValue':      av = a.mockAdpValue ?? -9999;  bv = b.mockAdpValue ?? -9999; break
        case 'flockRank':         av = a.flockRank;              bv = b.flockRank;             break
        case 'mockAdp':           av = a.mockAdp ?? 9999;        bv = b.mockAdp ?? 9999;       break
        case 'sleeperSearchRank': av = a.sleeperSearchRank;      bv = b.sleeperSearchRank;     break
        case 'wentAt':            av = a.wentAt ?? 9999;         bv = b.wentAt ?? 9999;        break
      }
      return sortDir === 'asc' ? av - bv : bv - av
    })
  }, [players, view, posFilter, search, sortKey, sortDir, myRosterId, effectiveValue])

  // ── Tier-aware row items ─────────────────────────────────────────────────────
  // Only inject tier dividers when sorted by flockRank ascending (rank order is meaningful)

  type RowItem =
    | { type: 'player'; player: EnrichedPlayer; idx: number; isLastInTier: boolean }
    | { type: 'divider'; tier: string }

  const rowItems = useMemo<RowItem[]>(() => {
    const showTiers = sortKey === 'flockRank' && sortDir === 'asc'
    if (!showTiers) {
      return filtered.map((player, idx) => ({ type: 'player', player, idx, isLastInTier: false }))
    }

    const items: RowItem[] = []
    let lastTier: string | null = null

    filtered.forEach((player, idx) => {
      const tier = player.tier ?? null
      if (tier && tier !== lastTier) {
        items.push({ type: 'divider', tier })
        lastTier = tier
      }
      const nextTier = filtered[idx + 1]?.tier ?? null
      const isLastInTier = !!tier && (idx === filtered.length - 1 || nextTier !== tier)
      items.push({ type: 'player', player, idx, isLastInTier })
    })

    return items
  }, [filtered, sortKey, sortDir])

  // ── Sidebar data ────────────────────────────────────────────────────────────

  const bestValueByPos = useMemo(() =>
    POSITIONS.map((pos) => {
      const bonus = needBonusFor(pos)
      const top3 = players
        .filter((p) => p.position === pos && p.available)
        .sort((a, b) => effectiveValue(b) - effectiveValue(a))
        .slice(0, 3)
      return { pos, top3, bonus }
    }),
  [players, effectiveValue, needBonusFor])

  const availableCount = useMemo(() => players.filter((p) => p.available).length, [players])
  const isDraftedView  = view === 'drafted' || view === 'mine'

  // Column count for colSpan in tier dividers / empty state
  const colCount = isDraftedView ? 10 : 9

  // ── Loading / fatal ─────────────────────────────────────────────────────────

  if (isLoading && players.length === 0) {
    return (
      <div>
        <h1 className="font-sans text-hero font-bold text-text mb-6">SDFF Draft Board</h1>
        <SkeletonLoader rows={12} />
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="pb-8">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h1 className="font-sans text-hero font-bold text-text">SDFF Draft Board</h1>
        <StatusPill status={draftStatus} />
        {draftStatus === 'drafting' && (
          <span className="text-small text-muted font-mono">Pick {currentPickNo} / {totalPicks}</span>
        )}
        {players.length > 0 && (
          <span className="text-small text-muted">{availableCount} available</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {liveDraftId && !isFetching && (
            <span className="text-label text-mutedLow">↻ in {countdown}s</span>
          )}
          {isFetching && (
            <span className="text-label text-gold flex items-center gap-1">
              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              syncing…
            </span>
          )}
          <button onClick={refresh} title="Refresh now"
            className={`transition-colors text-base ${isFetching ? 'text-gold animate-spin' : 'text-mutedLow hover:text-gold'}`}
          >↻</button>
          <button
            onClick={() => setConfigOpen((o) => !o)}
            title="Settings"
            className={`text-base transition-colors ${configOpen ? 'text-gold' : 'text-mutedLow hover:text-gold'}`}
          >⚙</button>
        </div>
      </div>

      {/* ── Error banner ─────────────────────────────────────────────────── */}
      {error && players.length > 0 && (
        <div className="bg-red-900/20 border border-red-500/30 rounded-lg px-4 py-2 mb-4 text-small text-red-300">
          {error} — showing last known data
        </div>
      )}
      {error && players.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <p className="text-muted">{error}</p>
          <button onClick={refresh} className="px-4 py-2 bg-surface border border-borderLow rounded text-small text-text hover:border-gold/40 transition-colors">Retry</button>
        </div>
      )}

      {/* ── Config panel ─────────────────────────────────────────────────── */}
      {configOpen && (
        <div className="bg-surface border border-borderLow rounded-lg p-4 mb-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-label text-muted uppercase font-semibold mb-1 tracking-wide">
                Live Draft ID <span title="sleeper.com/draft/nfl/THIS_PART" className="text-mutedLow cursor-help">?</span>
              </label>
              <div className="flex gap-2">
                <input type="text" value={liveInput} onChange={(e) => setLiveInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && applyLiveDraftId()}
                  placeholder="paste Sleeper draft ID…"
                  className="flex-1 bg-surfaceHi border border-borderLow rounded px-3 py-1.5 text-small text-text placeholder-mutedLow focus:outline-none focus:border-gold/50" />
                <button onClick={applyLiveDraftId} className="px-3 py-1.5 bg-gold text-[#1A1100] text-small font-bold rounded hover:bg-gold/90">Load</button>
              </div>
            </div>
            <div>
              <label className="block text-label text-muted uppercase font-semibold mb-1 tracking-wide">
                Mock ADP Baseline <span title="Pre-draft mock pick order" className="text-mutedLow cursor-help">?</span>
              </label>
              <div className="flex gap-2">
                <input type="text" value={mockInput} onChange={(e) => setMockInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && applyMockDraftId()}
                  placeholder="paste mock draft ID…"
                  className="flex-1 bg-surfaceHi border border-borderLow rounded px-3 py-1.5 text-small text-text placeholder-mutedLow focus:outline-none focus:border-gold/50" />
                <button onClick={applyMockDraftId} className="px-3 py-1.5 bg-gold text-[#1A1100] text-small font-bold rounded hover:bg-gold/90">Load</button>
              </div>
            </div>
            <div>
              <label className="block text-label text-muted uppercase font-semibold mb-1 tracking-wide">
                My Draft Slot <span title="Your pick position in the draft (1–12). Works for both live and mock drafts." className="text-mutedLow cursor-help">?</span>
              </label>
              <div className="flex gap-2">
                <input type="number" min={1} max={12} value={rosterInput}
                  onChange={(e) => setRosterInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && applyRosterId()}
                  placeholder="1 – 12"
                  className="flex-1 bg-surfaceHi border border-borderLow rounded px-3 py-1.5 text-small text-text placeholder-mutedLow focus:outline-none focus:border-gold/50" />
                <button onClick={applyRosterId} className="px-3 py-1.5 bg-gold text-[#1A1100] text-small font-bold rounded hover:bg-gold/90">Set</button>
              </div>
              {myRosterId != null && (
                <p className="text-label text-mutedLow mt-1">Tracking draft slot #{myRosterId}</p>
              )}
            </div>
          </div>
          <CsvUploadZone playerCount={players.length} onUploaded={reloadFlockRankings} />
        </div>
      )}

      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-3 mb-4">
        {/* View tabs */}
        <div className="flex gap-1">
          {([['value', '🎯 Value'], ['board', '📋 Board'], ['drafted', '✓ Drafted'], ['mine', '⭐ My Team']] as const).map(([v, label]) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1.5 text-small font-semibold rounded transition-all ${
                view === v ? 'bg-gold text-[#1A1100]' : 'bg-surfaceHi text-muted hover:text-text border border-borderLow'
              }`}
            >{label}</button>
          ))}
        </div>

        {/* Position filters */}
        <div className="flex gap-1">
          {(['ALL', ...POSITIONS] as PosFilter[]).map((pos) => (
            <button key={pos} onClick={() => setPosFilter(pos)}
              className={`px-2.5 py-1.5 text-label font-semibold rounded transition-all ${
                posFilter === pos ? 'bg-gold text-[#1A1100]' : 'bg-surfaceHi text-muted hover:text-text border border-borderLow'
              }`}
            >{pos}</button>
          ))}
        </div>

        {/* Positional need toggle — only useful when roster is set */}
        {myRosterId != null && (
          <button
            onClick={() => setNeedsToggle((t) => !t)}
            title={needsToggle ? 'Positional need ON — rankings adjusted for your roster' : 'Positional need OFF — click to adjust rankings for your roster needs'}
            className={`px-2.5 py-1.5 text-label font-semibold rounded border transition-all ${
              needsToggle
                ? 'bg-gold/20 text-gold border-gold/40'
                : 'bg-surfaceHi text-muted border-borderLow hover:text-text'
            }`}
          >
            {needsToggle ? '⚡ Need ON' : '⚡ Need'}
          </button>
        )}

        {/* Sort */}
        <select
          value={`${sortKey}:${sortDir}`}
          onChange={(e) => { const [k, d] = e.target.value.split(':') as [SortKey, 'asc' | 'desc']; setSortKey(k); setSortDir(d) }}
          className="bg-surfaceHi border border-borderLow rounded px-2 py-1.5 text-small text-text focus:outline-none focus:border-gold/50"
        >
          <option value="flockValue:desc">Flock Value ↓</option>
          <option value="mockAdpValue:desc">Mock ADP Value ↓</option>
          <option value="flockRank:asc">Flock Rank ↑</option>
          <option value="mockAdp:asc">Mock ADP ↑</option>
          <option value="sleeperSearchRank:asc">Sleeper ↑</option>
          {isDraftedView && <option value="wentAt:asc">Pick Order ↑</option>}
        </select>

        {/* Search */}
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search player or team…"
          className="flex-1 min-w-[160px] bg-surfaceHi border border-borderLow rounded px-3 py-1.5 text-small text-text placeholder-mutedLow focus:outline-none focus:border-gold/50" />
      </div>

      {/* Positional need summary (shown when toggle is active) */}
      {needsToggle && myRosterId != null && (
        <div className="flex flex-wrap gap-2 mb-4">
          {POSITIONS.map((pos) => {
            const have   = myCounts[pos]
            const target = ROSTER_TARGETS[pos]
            const diff   = have - target
            const isOver  = diff > 0
            const isUnder = diff < 0
            return (
              <div key={pos}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-label border ${
                  isOver  ? 'bg-red-900/20 text-red-300 border-red-500/30' :
                  isUnder ? 'bg-emerald-900/20 text-emerald-300 border-emerald-500/30' :
                            'bg-zinc-800/40 text-zinc-400 border-zinc-600/30'
                }`}
              >
                <PosBadge pos={pos} />
                <span className="font-mono font-semibold">{have}/{target}</span>
                {isOver  && <span>+{diff} surplus</span>}
                {isUnder && <span>{diff} needed</span>}
              </div>
            )
          })}
        </div>
      )}

      {/* "My Team" with no roster set */}
      {view === 'mine' && myRosterId == null && (
        <div className="bg-surface border border-borderLow rounded-lg px-5 py-8 text-center text-muted mb-4">
          Open ⚙ settings and enter your <strong className="text-text">Roster #</strong> to see your picks here.
        </div>
      )}

      {/* ── Main layout ───────────────────────────────────────────────────── */}
      <div className="flex gap-5">

        {/* ── Table ──────────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          <div className="overflow-x-auto bg-surface border border-borderLow rounded-lg">
            <table className="w-full text-small border-collapse" style={{ minWidth: isDraftedView ? 560 : 660 }}>
              <thead>
                <tr className="bg-surfaceHi border-b border-borderLow text-label text-muted uppercase tracking-wide">
                  <th className="px-3 py-2.5 text-left font-semibold w-8">#</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Player</th>
                  <th className="px-3 py-2.5 text-center font-semibold w-10">Pos</th>
                  <th className="px-3 py-2.5 text-center font-semibold w-10">Team</th>
                  <th className="px-3 py-2.5 text-center font-semibold w-14 cursor-pointer hover:text-text whitespace-nowrap"
                    onClick={() => handleSort('flockRank', 'asc')}>
                    Flock {sortIndicator('flockRank')}
                  </th>
                  <th className="px-3 py-2.5 text-center font-semibold w-16 cursor-pointer hover:text-text whitespace-nowrap"
                    onClick={() => handleSort('mockAdp', 'asc')}>
                    ADP {sortIndicator('mockAdp')}
                  </th>
                  {isDraftedView && (
                    <th className="px-3 py-2.5 text-center font-semibold w-14 cursor-pointer hover:text-text whitespace-nowrap"
                      onClick={() => handleSort('wentAt', 'asc')}>
                      Pick# {sortIndicator('wentAt')}
                    </th>
                  )}
                  <th className="px-3 py-2.5 text-center font-semibold w-20 cursor-pointer hover:text-text whitespace-nowrap"
                    onClick={() => handleSort('flockValue', 'desc')}>
                    {needsToggle ? 'vs Flock*' : 'vs Flock'} {sortIndicator('flockValue')}
                  </th>
                  <th className="px-3 py-2.5 text-center font-semibold w-16 cursor-pointer hover:text-text whitespace-nowrap"
                    onClick={() => handleSort('mockAdpValue', 'desc')}>
                    vs ADP {sortIndicator('mockAdpValue')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rowItems.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} className="px-4 py-10 text-center text-muted">
                      No players match the current filters
                    </td>
                  </tr>
                ) : rowItems.map((item, itemIdx) => {

                  // ── Tier divider row ──────────────────────────────────
                  if (item.type === 'divider') {
                    const tc = TIER_COLORS[item.tier] ?? TIER_COLOR_DEFAULT
                    return (
                      <tr key={`divider-${item.tier}-${itemIdx}`} className="border-b border-borderLow">
                        <td colSpan={colCount} className="px-3 py-1">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-px bg-borderLow" />
                            <span className={`text-label font-bold px-2.5 py-0.5 rounded border ${tc.bg} ${tc.text} ${tc.border}`}>
                              Tier {item.tier}
                            </span>
                            <div className="flex-1 h-px bg-borderLow" />
                          </div>
                        </td>
                      </tr>
                    )
                  }

                  // ── Player row ────────────────────────────────────────
                  const { player: p, idx: i, isLastInTier } = item
                  const effVal = effectiveValue(p)
                  const rowHighlight =
                    p.available && effVal >= 20 ? 'bg-emerald-900/25' :
                    p.available && effVal >= 10 ? 'bg-emerald-900/10' : ''
                  const namePrefix =
                    p.available && effVal >= 20 ? '🔥 ' :
                    p.available && effVal >= 10 ? '⚡ ' : ''
                  const isMyPick = p.draftedByRosterId === myRosterId && !p.available

                  // Tier color for "last of tier" border hint
                  const tc = p.tier ? (TIER_COLORS[p.tier] ?? TIER_COLOR_DEFAULT) : null

                  return (
                    <tr key={p.name + p.team}
                      className={[
                        'border-b border-borderLow last:border-0 hover:bg-white/3 transition-colors',
                        rowHighlight,
                        !p.available && view !== 'mine' && view !== 'drafted' ? 'opacity-40' : '',
                        isMyPick && view !== 'mine' ? 'bg-gold/5' : '',
                        isLastInTier && tc ? `border-b-2 ${tc.border}` : '',
                      ].filter(Boolean).join(' ')}
                    >
                      <td className="px-3 py-2 font-mono text-mutedLow">{i + 1}</td>
                      <td className="px-3 py-2 max-w-[200px]">
                        <span className={`text-text font-semibold truncate block ${!p.available ? 'line-through opacity-60' : ''}`}
                          title={p.name}>
                          {namePrefix}{p.name}
                        </span>
                        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                          {p.dynastyProfile && <ProfileBadge profile={p.dynastyProfile} />}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center"><PosBadge pos={p.position} /></td>
                      <td className="px-3 py-2 text-center font-mono text-muted">{p.team || '—'}</td>
                      <td className="px-3 py-2 text-center font-mono text-muted">{p.flockRank}</td>
                      <td className="px-3 py-2 text-center font-mono text-muted">{p.mockAdp ?? '—'}</td>
                      {isDraftedView && (
                        <td className="px-3 py-2 text-center font-mono text-muted">
                          {p.wentAt != null ? `#${p.wentAt}` : '—'}
                        </td>
                      )}
                      <td className="px-3 py-2 text-center">
                        {needsToggle
                          ? <ValueCell value={Math.round(effVal * 100) / 100} />
                          : <ValueCell value={p.flockValue} />
                        }
                      </td>
                      <td className="px-3 py-2 text-center"><ValueCell value={p.mockAdpValue} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-label text-mutedLow mt-2">
            {filtered.length} player{filtered.length !== 1 ? 's' : ''}
            {posFilter !== 'ALL' ? ` · ${posFilter}` : ''}
            {search ? ` · "${search}"` : ''}
            {needsToggle ? ' · ⚡ need-adjusted' : ''}
          </p>
        </div>

        {/* ── Sidebar (desktop) ─────────────────────────────────────────── */}
        <div className="hidden lg:flex flex-col gap-5 w-64 shrink-0">

          <div className="bg-surface border border-borderLow rounded-lg overflow-hidden">
            <div className="bg-surfaceHi border-b border-borderLow px-4 py-2.5 flex items-center justify-between">
              <div className="text-label uppercase font-bold text-muted tracking-wide">Best Value</div>
              {needsToggle && <span className="text-[10px] text-gold font-semibold">⚡ need-adjusted</span>}
            </div>
            <div className="p-3 space-y-3">
              {bestValueByPos.map(({ pos, top3, bonus }) => {
                const isNeeded   = needsToggle && bonus > 0
                const isSurplus  = needsToggle && bonus < 0
                return (
                  <div key={pos}>
                    <div className="mb-1 flex items-center gap-1.5">
                      <PosBadge pos={pos} />
                      {isNeeded  && <span className="text-[10px] text-emerald-400 font-semibold">need {myCounts[pos]}/{ROSTER_TARGETS[pos]}</span>}
                      {isSurplus && <span className="text-[10px] text-red-400 font-semibold">surplus {myCounts[pos]}/{ROSTER_TARGETS[pos]}</span>}
                    </div>
                    {top3.length === 0 ? (
                      <p className="text-label text-mutedLow pl-1">None fallen yet</p>
                    ) : top3.map((p) => (
                      <div key={p.name} className="flex items-center gap-1 py-0.5">
                        <span className="text-small text-text truncate flex-1 min-w-0" title={p.name}>{p.name}</span>
                        <span className="shrink-0 ml-1">
                          <ValueCell value={needsToggle ? Math.round(effectiveValue(p) * 100) / 100 : p.flockValue} />
                        </span>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="bg-surface border border-borderLow rounded-lg overflow-hidden">
            <div className="bg-surfaceHi border-b border-borderLow px-4 py-2.5">
              <div className="text-label uppercase font-bold text-muted tracking-wide">Recent Picks</div>
            </div>
            <div>
              {recentPicks.length === 0 ? (
                <p className="px-4 py-4 text-small text-mutedLow text-center">No picks yet</p>
              ) : recentPicks.map((pick) => {
                const flockEntry = players.find((p) => p.playerId === pick.player_id)
                const name = [pick.metadata.first_name, pick.metadata.last_name].filter(Boolean).join(' ')
                const isMe = pick.roster_id === myRosterId
                return (
                  <div key={pick.pick_no}
                    className={`flex items-center gap-2 px-3 py-2 border-b border-borderLow last:border-0 ${isMe ? 'bg-gold/8' : ''}`}>
                    <span className={`font-mono text-label font-bold shrink-0 w-7 ${isMe ? 'text-gold' : 'text-mutedLow'}`}>
                      #{pick.pick_no}
                    </span>
                    <PosBadge pos={pick.metadata.position} />
                    <div className="flex-1 min-w-0">
                      <div className="text-small text-text truncate" title={name}>{name}</div>
                      {flockEntry && (
                        <div className="text-label text-mutedLow">
                          Flock #{flockEntry.flockRank}
                          {flockEntry.dynastyProfile && (
                            <span className="ml-1.5"><ProfileBadge profile={flockEntry.dynastyProfile} /></span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
