import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useDraftData, type EnrichedPlayer } from '@/hooks/useDraftData'
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

const POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE']

const LS_LIVE    = 'sdff_live_draft_id'
const LS_MOCK    = 'sdff_mock_draft_id'
const LS_FLOCK_TS = 'sdff_flock_updated_at'
const LS_ROSTER  = 'sdff_my_roster_id'

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
  const [dragOver, setDragOver]     = useState(false)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [uploadMsg, setUploadMsg]   = useState('')
  const [preview, setPreview]       = useState<{ count: number; csv: string } | null>(null)
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

  const [view,      setViewState] = useState<View>('value')
  const [posFilter, setPosFilter] = useState<PosFilter>('ALL')
  const [sortKey,   setSortKey]   = useState<SortKey>('flockValue')
  const [sortDir,   setSortDir]   = useState<'asc' | 'desc'>('desc')
  const [search,    setSearch]    = useState('')

  const { players, recentPicks, currentPickNo, draftStatus, totalPicks, lastRefresh, isLoading, error, refresh, reloadFlockRankings } =
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
    if (v === 'board')   { setSortKey('flockRank');   setSortDir('asc') }
    else if (v === 'drafted' || v === 'mine') { setSortKey('wentAt'); setSortDir('asc') }
    else                 { setSortKey('flockValue');  setSortDir('desc') }
  }

  // ── Filtered + sorted list ──────────────────────────────────────────────────

  const filtered = useMemo<EnrichedPlayer[]>(() => {
    let list = players

    if (view === 'value')   list = list.filter((p) => p.available && p.flockValue >= -10)
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
        case 'flockValue':        av = a.flockValue;             bv = b.flockValue;             break
        case 'mockAdpValue':      av = a.mockAdpValue ?? -9999;  bv = b.mockAdpValue ?? -9999;  break
        case 'flockRank':         av = a.flockRank;              bv = b.flockRank;              break
        case 'mockAdp':           av = a.mockAdp ?? 9999;        bv = b.mockAdp ?? 9999;        break
        case 'sleeperSearchRank': av = a.sleeperSearchRank;      bv = b.sleeperSearchRank;      break
        case 'wentAt':            av = a.wentAt ?? 9999;         bv = b.wentAt ?? 9999;         break
      }
      return sortDir === 'asc' ? av - bv : bv - av
    })
  }, [players, view, posFilter, search, sortKey, sortDir, myRosterId])

  // ── Sidebar data ────────────────────────────────────────────────────────────

  const bestValueByPos = useMemo(() =>
    POSITIONS.map((pos) => ({
      pos,
      top3: players
        .filter((p) => p.position === pos && p.available)
        .sort((a, b) => b.flockValue - a.flockValue)
        .slice(0, 3),
    })),
  [players])

  const availableCount = useMemo(() => players.filter((p) => p.available).length, [players])

  const isDraftedView = view === 'drafted' || view === 'mine'

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
          {liveDraftId && <span className="text-label text-mutedLow">↻ in {countdown}s</span>}
          <button onClick={refresh} title="Refresh now" className="text-mutedLow hover:text-gold transition-colors text-base">↻</button>
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
                My Roster # <span title="Your draft slot / roster number (1–12). Used for the My Team filter." className="text-mutedLow cursor-help">?</span>
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
                <p className="text-label text-mutedLow mt-1">Currently tracking roster #{myRosterId}</p>
              )}
            </div>
          </div>
          <CsvUploadZone playerCount={players.length} onUploaded={reloadFlockRankings} />
        </div>
      )}

      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-3 mb-4">
        <div className="flex gap-1">
          {([['value', '🎯 Value'], ['board', '📋 Board'], ['drafted', '✓ Drafted'], ['mine', '⭐ My Team']] as const).map(([v, label]) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1.5 text-small font-semibold rounded transition-all ${
                view === v ? 'bg-gold text-[#1A1100]' : 'bg-surfaceHi text-muted hover:text-text border border-borderLow'
              }`}
            >{label}</button>
          ))}
        </div>
        <div className="flex gap-1">
          {(['ALL', ...POSITIONS] as PosFilter[]).map((pos) => (
            <button key={pos} onClick={() => setPosFilter(pos)}
              className={`px-2.5 py-1.5 text-label font-semibold rounded transition-all ${
                posFilter === pos ? 'bg-gold text-[#1A1100]' : 'bg-surfaceHi text-muted hover:text-text border border-borderLow'
              }`}
            >{pos}</button>
          ))}
        </div>
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
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search player or team…"
          className="flex-1 min-w-[160px] bg-surfaceHi border border-borderLow rounded px-3 py-1.5 text-small text-text placeholder-mutedLow focus:outline-none focus:border-gold/50" />
      </div>

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
            <table className="w-full text-small border-collapse" style={{ minWidth: isDraftedView ? 520 : 620 }}>
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
                    vs Flock {sortIndicator('flockValue')}
                  </th>
                  <th className="px-3 py-2.5 text-center font-semibold w-16 cursor-pointer hover:text-text whitespace-nowrap"
                    onClick={() => handleSort('mockAdpValue', 'desc')}>
                    vs ADP {sortIndicator('mockAdpValue')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-muted">
                      No players match the current filters
                    </td>
                  </tr>
                ) : filtered.map((p, i) => {
                  const rowHighlight =
                    p.available && p.flockValue >= 20 ? 'bg-emerald-900/25' :
                    p.available && p.flockValue >= 10 ? 'bg-emerald-900/10' : ''
                  const namePrefix =
                    p.available && p.flockValue >= 20 ? '🔥 ' :
                    p.available && p.flockValue >= 10 ? '⚡ ' : ''
                  const isMyPick = p.draftedByRosterId === myRosterId && !p.available

                  return (
                    <tr key={p.name + p.team}
                      className={`border-b border-borderLow last:border-0 hover:bg-white/3 transition-colors ${rowHighlight} ${!p.available && view !== 'mine' && view !== 'drafted' ? 'opacity-40' : ''} ${isMyPick && view !== 'mine' ? 'bg-gold/5' : ''}`}
                    >
                      <td className="px-3 py-2 font-mono text-mutedLow">{i + 1}</td>
                      <td className="px-3 py-2 max-w-[180px]">
                        <span className={`text-text font-semibold truncate block ${!p.available ? 'line-through opacity-60' : ''}`}
                          title={p.name}>
                          {namePrefix}{p.name}
                        </span>
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
                      <td className="px-3 py-2 text-center"><ValueCell value={p.flockValue} /></td>
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
          </p>
        </div>

        {/* ── Sidebar (desktop) ─────────────────────────────────────────── */}
        <div className="hidden lg:flex flex-col gap-5 w-60 shrink-0">

          <div className="bg-surface border border-borderLow rounded-lg overflow-hidden">
            <div className="bg-surfaceHi border-b border-borderLow px-4 py-2.5">
              <div className="text-label uppercase font-bold text-muted tracking-wide">Best Value</div>
            </div>
            <div className="p-3 space-y-3">
              {bestValueByPos.map(({ pos, top3 }) => (
                <div key={pos}>
                  <div className="mb-1"><PosBadge pos={pos} /></div>
                  {top3.length === 0 ? (
                    <p className="text-label text-mutedLow pl-1">None fallen yet</p>
                  ) : top3.map((p) => (
                    <div key={p.name} className="flex items-center gap-1 py-0.5">
                      <span className="text-small text-text truncate flex-1 min-w-0" title={p.name}>{p.name}</span>
                      <span className="shrink-0 ml-1"><ValueCell value={p.flockValue} /></span>
                    </div>
                  ))}
                </div>
              ))}
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
                        <div className="text-label text-mutedLow">Flock #{flockEntry.flockRank}</div>
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
