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

const LS_LIVE = 'sdff_live_draft_id'
const LS_MOCK = 'sdff_mock_draft_id'
const LS_FLOCK_TS = 'sdff_flock_updated_at'

type View = 'value' | 'board' | 'drafted'
type PosFilter = 'ALL' | Position
type SortKey = 'flockValue' | 'mockAdpValue' | 'flockRank' | 'mockAdp' | 'sleeperSearchRank' | 'wentAt'

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
  if (value > 0) return <span className="text-emerald-400 font-mono font-semibold">+{value}</span>
  if (value < 0) return <span className="font-mono text-mutedLow">{value}</span>
  return <span className="font-mono text-muted">0</span>
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

// ── Drag-drop CSV upload zone ─────────────────────────────────────────────────

type UploadState = 'idle' | 'ready' | 'uploading' | 'success' | 'error'

function CsvUploadZone({
  playerCount,
  onUploaded,
}: {
  playerCount: number
  onUploaded: () => void
}) {
  const [dragOver, setDragOver] = useState(false)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [uploadMsg, setUploadMsg] = useState('')
  const [preview, setPreview] = useState<{ count: number; csv: string } | null>(null)
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

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  async function doUpload() {
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
      <div className="text-label text-muted uppercase font-semibold mb-2 tracking-wide">
        Flock Rankings CSV
      </div>
      <div
        className={`border-2 border-dashed rounded-lg px-5 py-4 text-center cursor-pointer transition-all ${borderClass}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={onFileChange}
        />
        {uploadState === 'ready' && preview ? (
          <p className="text-base text-text font-semibold">
            Ready to upload: {preview.count} players
          </p>
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

      {uploadState === 'uploading' && (
        <p className="mt-2 text-small text-muted">Uploading…</p>
      )}

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
  // Draft ID state — init from localStorage, fall back to VITE_ env vars
  const [liveDraftId, setLiveDraftId] = useState(
    () => localStorage.getItem(LS_LIVE) ?? (import.meta.env.VITE_LIVE_DRAFT_ID as string | undefined) ?? '',
  )
  const [mockDraftId, setMockDraftId] = useState(
    () => localStorage.getItem(LS_MOCK) ?? (import.meta.env.VITE_MOCK_DRAFT_ID as string | undefined) ?? '',
  )
  const [liveInput, setLiveInput] = useState(liveDraftId)
  const [mockInput, setMockInput] = useState(mockDraftId)
  const [configOpen, setConfigOpen] = useState(false)

  // View / filter / sort
  const [view, setView] = useState<View>('value')
  const [posFilter, setPosFilter] = useState<PosFilter>('ALL')
  const [sortKey, setSortKey] = useState<SortKey>('flockValue')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [search, setSearch] = useState('')

  const { players, recentPicks, currentPickNo, draftStatus, totalPicks, lastRefresh, isLoading, error, refresh, reloadFlockRankings } =
    useDraftData({ liveDraftId, mockDraftId })

  // ── Countdown timer ─────────────────────────────────────────────────────────

  const [countdown, setCountdown] = useState(30)

  useEffect(() => {
    setCountdown(30)
  }, [lastRefresh])

  useEffect(() => {
    if (!liveDraftId) return
    const id = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000)
    return () => clearInterval(id)
  }, [liveDraftId])

  // ── Load handlers ───────────────────────────────────────────────────────────

  function applyLiveDraftId() {
    const val = liveInput.trim()
    localStorage.setItem(LS_LIVE, val)
    setLiveDraftId(val)
  }

  function applyMockDraftId() {
    const val = mockInput.trim()
    localStorage.setItem(LS_MOCK, val)
    setMockDraftId(val)
  }

  // ── Sorting ─────────────────────────────────────────────────────────────────

  function handleSort(key: SortKey, defaultDir: 'asc' | 'desc' = 'desc') {
    if (sortKey === key) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(defaultDir)
    }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return <span className="text-mutedLow ml-0.5">↕</span>
    return <span className="text-gold ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  // Auto-sort when switching views
  function setView2(v: View) {
    setView(v)
    if (v === 'board') { setSortKey('flockRank'); setSortDir('asc') }
    else if (v === 'drafted') { setSortKey('wentAt'); setSortDir('desc') }
    else { setSortKey('flockValue'); setSortDir('desc') }
  }

  // ── Filtered + sorted list ──────────────────────────────────────────────────

  const filtered = useMemo<EnrichedPlayer[]>(() => {
    let list = players

    // View filter
    if (view === 'value') list = list.filter((p) => p.available && p.flockValue >= -10)
    else if (view === 'board') list = list.filter((p) => p.available)
    else list = list.filter((p) => !p.available)

    // Position filter
    if (posFilter !== 'ALL') list = list.filter((p) => p.position === posFilter)

    // Search
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q),
      )
    }

    // Sort
    return [...list].sort((a, b) => {
      let av: number
      let bv: number
      switch (sortKey) {
        case 'flockValue':   av = a.flockValue;             bv = b.flockValue; break
        case 'mockAdpValue': av = a.mockAdpValue ?? -9999;  bv = b.mockAdpValue ?? -9999; break
        case 'flockRank':    av = a.flockRank;              bv = b.flockRank; break
        case 'mockAdp':      av = a.mockAdp ?? 9999;        bv = b.mockAdp ?? 9999; break
        case 'sleeperSearchRank': av = a.sleeperSearchRank; bv = b.sleeperSearchRank; break
        case 'wentAt':       av = a.wentAt ?? 9999;         bv = b.wentAt ?? 9999; break
      }
      return sortDir === 'asc' ? av - bv : bv - av
    })
  }, [players, view, posFilter, search, sortKey, sortDir])

  // ── Sidebar data ────────────────────────────────────────────────────────────

  const bestValueByPos = useMemo(() => {
    return POSITIONS.map((pos) => ({
      pos,
      top3: players
        .filter((p) => p.position === pos && p.available)
        .sort((a, b) => b.flockValue - a.flockValue)
        .slice(0, 3),
    }))
  }, [players])

  const availableCount = useMemo(() => players.filter((p) => p.available).length, [players])

  // ── Loading / fatal error states ────────────────────────────────────────────

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

      {/* ── Header bar ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h1 className="font-sans text-hero font-bold text-text">SDFF Draft Board</h1>

        <StatusPill status={draftStatus} />

        {draftStatus === 'drafting' && (
          <span className="text-small text-muted font-mono">
            Pick {currentPickNo} / {totalPicks}
          </span>
        )}

        {players.length > 0 && (
          <span className="text-small text-muted">{availableCount} available</span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {liveDraftId && (
            <span className="text-label text-mutedLow">
              ↻ in {countdown}s
            </span>
          )}
          <button
            onClick={refresh}
            title="Refresh now"
            className="text-mutedLow hover:text-gold transition-colors text-base"
          >
            ↻
          </button>
          <button
            onClick={() => setConfigOpen((o) => !o)}
            title="Settings"
            className={`text-base transition-colors ${configOpen ? 'text-gold' : 'text-mutedLow hover:text-gold'}`}
          >
            ⚙
          </button>
        </div>
      </div>

      {/* ── Non-fatal error banner ────────────────────────────────────────── */}
      {error && players.length > 0 && (
        <div className="bg-red-900/20 border border-red-500/30 rounded-lg px-4 py-2 mb-4 text-small text-red-300">
          {error} — showing last known data
        </div>
      )}

      {/* Fatal error (no data) */}
      {error && players.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <p className="text-muted">{error}</p>
          <button
            onClick={refresh}
            className="px-4 py-2 bg-surface border border-borderLow rounded text-small text-text hover:border-gold/40 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Config panel (collapsible) ────────────────────────────────────── */}
      {configOpen && (
        <div className="bg-surface border border-borderLow rounded-lg p-4 mb-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Live Draft ID */}
            <div>
              <label className="block text-label text-muted uppercase font-semibold mb-1 tracking-wide">
                Live Draft ID
                <span
                  title="The Sleeper draft ID from your active draft URL: sleeper.com/draft/nfl/THIS_PART"
                  className="ml-1.5 text-mutedLow cursor-help"
                >
                  ?
                </span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={liveInput}
                  onChange={(e) => setLiveInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && applyLiveDraftId()}
                  placeholder="paste Sleeper draft ID…"
                  className="flex-1 bg-surfaceHi border border-borderLow rounded px-3 py-1.5 text-small text-text placeholder-mutedLow focus:outline-none focus:border-gold/50"
                />
                <button
                  onClick={applyLiveDraftId}
                  className="px-3 py-1.5 bg-gold text-[#1A1100] text-small font-bold rounded hover:bg-gold/90 transition-colors"
                >
                  Load
                </button>
              </div>
            </div>

            {/* Mock Draft ID */}
            <div>
              <label className="block text-label text-muted uppercase font-semibold mb-1 tracking-wide">
                Mock ADP Baseline
                <span
                  title="Pick order from your pre-draft mock. Shows where your league consensus valued each player."
                  className="ml-1.5 text-mutedLow cursor-help"
                >
                  ?
                </span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={mockInput}
                  onChange={(e) => setMockInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && applyMockDraftId()}
                  placeholder="paste mock draft ID…"
                  className="flex-1 bg-surfaceHi border border-borderLow rounded px-3 py-1.5 text-small text-text placeholder-mutedLow focus:outline-none focus:border-gold/50"
                />
                <button
                  onClick={applyMockDraftId}
                  className="px-3 py-1.5 bg-gold text-[#1A1100] text-small font-bold rounded hover:bg-gold/90 transition-colors"
                >
                  Load
                </button>
              </div>
            </div>
          </div>

          <CsvUploadZone
            playerCount={players.length}
            onUploaded={reloadFlockRankings}
          />
        </div>
      )}

      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-3 mb-4">

        {/* View tabs */}
        <div className="flex gap-1">
          {([['value', '🎯 Value'], ['board', '📋 Board'], ['drafted', '✓ Drafted']] as const).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setView2(v)}
              className={`px-3 py-1.5 text-small font-semibold rounded transition-all ${
                view === v ? 'bg-gold text-[#1A1100]' : 'bg-surfaceHi text-muted hover:text-text border border-borderLow'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Position filters */}
        <div className="flex gap-1">
          {(['ALL', ...POSITIONS] as PosFilter[]).map((pos) => (
            <button
              key={pos}
              onClick={() => setPosFilter(pos)}
              className={`px-2.5 py-1.5 text-label font-semibold rounded transition-all ${
                posFilter === pos
                  ? 'bg-gold text-[#1A1100]'
                  : `bg-surfaceHi text-muted hover:text-text border border-borderLow`
              }`}
            >
              {pos}
            </button>
          ))}
        </div>

        {/* Sort dropdown */}
        <select
          value={`${sortKey}:${sortDir}`}
          onChange={(e) => {
            const [k, d] = e.target.value.split(':') as [SortKey, 'asc' | 'desc']
            setSortKey(k)
            setSortDir(d)
          }}
          className="bg-surfaceHi border border-borderLow rounded px-2 py-1.5 text-small text-text focus:outline-none focus:border-gold/50"
        >
          <option value="flockValue:desc">Flock Value ↓</option>
          <option value="mockAdpValue:desc">Mock ADP Value ↓</option>
          <option value="flockRank:asc">Flock Rank ↑</option>
          <option value="mockAdp:asc">Mock ADP ↑</option>
          <option value="sleeperSearchRank:asc">Sleeper ↑</option>
          {view === 'drafted' && <option value="wentAt:desc">Drafted At ↓</option>}
        </select>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search player or team…"
          className="flex-1 min-w-[160px] bg-surfaceHi border border-borderLow rounded px-3 py-1.5 text-small text-text placeholder-mutedLow focus:outline-none focus:border-gold/50"
        />
      </div>

      {/* ── Main layout: table + sidebar ─────────────────────────────────── */}
      <div className="flex gap-5">

        {/* ── Table ──────────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          <div className="overflow-x-auto bg-surface border border-borderLow rounded-lg">
            <table className="w-full min-w-[700px] text-small border-collapse">
              <thead>
                <tr className="bg-surfaceHi border-b border-borderLow text-label text-muted uppercase tracking-wide">
                  <th className="px-3 py-2.5 text-left font-semibold w-10">#</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Player</th>
                  <th className="px-3 py-2.5 text-center font-semibold w-12">Pos</th>
                  <th className="px-3 py-2.5 text-center font-semibold w-12">Team</th>
                  <th
                    className="px-3 py-2.5 text-center font-semibold w-16 cursor-pointer hover:text-text"
                    onClick={() => handleSort('flockRank', 'asc')}
                  >
                    Flock {sortIndicator('flockRank')}
                  </th>
                  <th
                    className="px-3 py-2.5 text-center font-semibold w-20 cursor-pointer hover:text-text"
                    onClick={() => handleSort('mockAdp', 'asc')}
                  >
                    Mock ADP {sortIndicator('mockAdp')}
                  </th>
                  <th
                    className="px-3 py-2.5 text-center font-semibold w-16 cursor-pointer hover:text-text"
                    onClick={() => handleSort('sleeperSearchRank', 'asc')}
                  >
                    Sleeper {sortIndicator('sleeperSearchRank')}
                  </th>
                  <th className="px-3 py-2.5 text-center font-semibold w-16">Pick#</th>
                  <th
                    className="px-3 py-2.5 text-center font-semibold w-20 cursor-pointer hover:text-text"
                    onClick={() => handleSort('flockValue', 'desc')}
                  >
                    vs Flock {sortIndicator('flockValue')}
                  </th>
                  <th
                    className="px-3 py-2.5 text-center font-semibold w-16 cursor-pointer hover:text-text"
                    onClick={() => handleSort('mockAdpValue', 'desc')}
                  >
                    vs ADP {sortIndicator('mockAdpValue')}
                  </th>
                  <th className="px-3 py-2.5 text-center font-semibold w-20">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-muted">
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

                  return (
                    <tr
                      key={p.name + p.team}
                      className={`border-b border-borderLow last:border-0 hover:bg-white/3 transition-colors ${rowHighlight} ${!p.available ? 'opacity-50' : ''}`}
                    >
                      <td className="px-3 py-2 font-mono text-mutedLow">{i + 1}</td>
                      <td className="px-3 py-2">
                        <span className={`text-text font-semibold ${!p.available ? 'line-through' : ''}`}>
                          {namePrefix}{p.name}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <PosBadge pos={p.position} />
                      </td>
                      <td className="px-3 py-2 text-center font-mono text-muted">
                        {p.team || '—'}
                      </td>
                      <td className="px-3 py-2 text-center font-mono text-muted">
                        {p.flockRank}
                      </td>
                      <td className="px-3 py-2 text-center font-mono text-muted">
                        {p.mockAdp ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-center font-mono text-muted">
                        {p.sleeperSearchRank === 9999 ? '—' : p.sleeperSearchRank}
                      </td>
                      <td className="px-3 py-2 text-center font-mono text-mutedLow">
                        {p.available ? (
                          <span title="Current pick">{currentPickNo}…</span>
                        ) : (
                          <span className="text-muted">#{p.wentAt}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <ValueCell value={p.flockValue} />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <ValueCell value={p.mockAdpValue} />
                      </td>
                      <td className="px-3 py-2 text-center">
                        {p.available ? (
                          <span className="text-label text-emerald-400 font-semibold">Available</span>
                        ) : (
                          <span className="text-label text-mutedLow">Drafted</span>
                        )}
                      </td>
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

        {/* ── Right sidebar (desktop only) ──────────────────────────────── */}
        <div className="hidden lg:flex flex-col gap-5 w-56 shrink-0">

          {/* Best Value Available */}
          <div className="bg-surface border border-borderLow rounded-lg overflow-hidden">
            <div className="bg-surfaceHi border-b border-borderLow px-4 py-2.5">
              <div className="text-label uppercase font-bold text-muted tracking-wide">Best Value</div>
            </div>
            <div className="p-3 space-y-3">
              {bestValueByPos.map(({ pos, top3 }) => (
                <div key={pos}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <PosBadge pos={pos} />
                  </div>
                  {top3.length === 0 ? (
                    <p className="text-label text-mutedLow pl-1">None fallen yet</p>
                  ) : top3.map((p) => (
                    <div key={p.name} className="flex items-center justify-between pl-1 py-0.5">
                      <span className="text-small text-text truncate flex-1 pr-1">{p.name}</span>
                      <ValueCell value={p.flockValue} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Recent Picks */}
          <div className="bg-surface border border-borderLow rounded-lg overflow-hidden">
            <div className="bg-surfaceHi border-b border-borderLow px-4 py-2.5">
              <div className="text-label uppercase font-bold text-muted tracking-wide">Recent Picks</div>
            </div>
            <div>
              {recentPicks.length === 0 ? (
                <p className="px-4 py-4 text-small text-mutedLow text-center">No picks yet</p>
              ) : recentPicks.map((pick) => {
                // Find Flock rank for this player
                const flockEntry = players.find((p) => p.playerId === pick.player_id)
                const name = [pick.metadata.first_name, pick.metadata.last_name].filter(Boolean).join(' ')
                return (
                  <div key={pick.pick_no} className="flex items-center gap-2 px-3 py-2 border-b border-borderLow last:border-0">
                    <span className="font-mono text-label text-gold font-bold shrink-0 w-7">#{pick.pick_no}</span>
                    <PosBadge pos={pick.metadata.position} />
                    <div className="flex-1 min-w-0">
                      <div className="text-small text-text truncate">{name}</div>
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
