import { useState, useMemo } from 'react'
import { useDraftPicks } from '@/hooks/useDraftPicks'
import { useDraftInfo, useKTCRankings, useSleeperStats } from '@/hooks/useDraft'
import { useRosters } from '@/hooks/useRosters'
import { useUsers } from '@/hooks/useUsers'
import { gradeTeams, DRAFT_ID, type TeamGrade } from '@/lib/draftGrades'
import SkeletonLoader from '@/components/ui/SkeletonLoader'

const GRADE_STYLES: Record<TeamGrade['grade'], string> = {
  Contender: 'bg-green-900/40 text-green-300 border border-green-500/30',
  Competitive: 'bg-blue-900/40 text-blue-300 border border-blue-500/30',
  Rebuilding: 'bg-yellow-900/40 text-yellow-300 border border-yellow-500/30',
}

const POS_COLORS: Record<string, string> = {
  QB: 'bg-red-900/40 text-red-300 border border-red-500/30',
  RB: 'bg-blue-900/40 text-blue-300 border border-blue-500/30',
  WR: 'bg-green-900/40 text-green-300 border border-green-500/30',
  TE: 'bg-yellow-900/40 text-yellow-300 border border-yellow-500/30',
}

function formatK(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n))
}

export default function DraftGrades() {
  const picks = useDraftPicks(DRAFT_ID)
  const info = useDraftInfo(DRAFT_ID)
  const ktc = useKTCRankings()
  const proj = useSleeperStats(2025)
  const rosters = useRosters()
  const users = useUsers()

  const [sortBy, setSortBy] = useState<'value' | 'proj'>('value')
  const [expanded, setExpanded] = useState<number | null>(null)

  const isLoading =
    picks.isLoading ||
    info.isLoading ||
    rosters.isLoading ||
    users.isLoading

  const isError =
    picks.isError || info.isError || rosters.isError || users.isError

  const grades = useMemo(() => {
    if (!picks.data || !rosters.data || !users.data) return []
    return gradeTeams(picks.data, rosters.data, users.data, ktc.data ?? [], proj.data ?? {})
  }, [picks.data, rosters.data, users.data, ktc.data, proj.data])

  const sorted = useMemo(
    () =>
      [...grades].sort((a, b) =>
        sortBy === 'value' ? b.valueScore - a.valueScore : b.projScore - a.projScore,
      ),
    [grades, sortBy],
  )

  const totalPicks = (info.data?.settings?.rounds ?? 4) * 12
  const picksComplete = picks.data?.length ?? 0
  const isLive = picks.data != null && info.data != null && picksComplete < totalPicks

  const maxDynastyValue = grades.length > 0 ? Math.max(...grades.map(g => g.totalDynastyValue)) : 1

  function handleRetry() {
    void picks.refetch()
    void info.refetch()
    void ktc.refetch()
    void proj.refetch()
    void rosters.refetch()
    void users.refetch()
  }

  if (isLoading) {
    return (
      <div>
        <h1 className="font-sans text-h1 sm:text-hero font-bold text-text mb-8">Draft Grades</h1>
        <SkeletonLoader rows={12} />
      </div>
    )
  }

  if (isError) {
    return (
      <div>
        <h1 className="font-sans text-h1 sm:text-hero font-bold text-text mb-4">Draft Grades</h1>
        <div className="bg-surface border border-red-500/30 rounded-lg p-6 text-center">
          <p className="text-base text-muted mb-3">Failed to load draft grades.</p>
          <button
            onClick={handleRetry}
            className="text-small font-semibold text-gold hover:text-gold/80 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1.5">
          <h1 className="font-sans text-h1 sm:text-hero font-bold text-text">Draft Grades</h1>
          {isLive && (
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-gold/10 border border-gold/30 text-label font-semibold text-gold shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
              LIVE
            </span>
          )}
        </div>
        <p className="text-body text-muted">
          {info.data?.name ?? 'Startup Draft'}
          {' · '}
          {picksComplete} of {totalPicks} picks
          <span className="text-label text-mutedLow ml-3">
            Updated {picks.dataUpdatedAt ? new Date(picks.dataUpdatedAt).toLocaleTimeString() : '—'}
          </span>
        </p>
      </div>

      {/* Sort toggle */}
      <div className="flex gap-1 bg-surfaceHi border border-borderLow rounded-lg p-1 w-fit">
        {(['value', 'proj'] as const).map(v => (
          <button
            key={v}
            onClick={() => setSortBy(v)}
            className={`px-4 py-2 text-small font-semibold rounded-md transition-all ${
              sortBy === v ? 'bg-gold text-[#1A1100]' : 'text-muted hover:text-text'
            }`}
          >
            {v === 'value' ? 'Dynasty Value' : '2025 Points'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-surface border border-borderLow rounded-lg overflow-hidden">
        {/* Desktop header */}
        <div className="hidden sm:grid grid-cols-[2rem_minmax(0,1fr)_5.5rem_5rem_3.5rem_5rem_6.5rem] gap-x-4 bg-surfaceHi border-b border-borderLow px-5 py-3">
          <div className="text-label font-bold text-mutedLow uppercase tracking-wide">#</div>
          <div className="text-label font-bold text-mutedLow uppercase tracking-wide">Team</div>
          <div className="text-label font-bold text-mutedLow uppercase tracking-wide text-right">Dyn Value</div>
          <div className="text-label font-bold text-mutedLow uppercase tracking-wide text-right">2025 Pts</div>
          <div className="text-label font-bold text-mutedLow uppercase tracking-wide text-right">Age</div>
          <div className="text-label font-bold text-mutedLow uppercase tracking-wide" />
          <div className="text-label font-bold text-mutedLow uppercase tracking-wide text-right">Grade</div>
        </div>
        {/* Mobile header */}
        <div className="sm:hidden grid grid-cols-[1.5rem_minmax(0,1fr)_5rem_5.5rem] gap-x-3 bg-surfaceHi border-b border-borderLow px-4 py-3">
          <div className="text-label font-bold text-mutedLow uppercase tracking-wide">#</div>
          <div className="text-label font-bold text-mutedLow uppercase tracking-wide">Team</div>
          <div className="text-label font-bold text-mutedLow uppercase tracking-wide text-right">Value</div>
          <div className="text-label font-bold text-mutedLow uppercase tracking-wide text-right">Grade</div>
        </div>

        {sorted.length === 0 && (
          <div className="px-5 py-12 text-center text-muted text-base">
            No picks have been made yet.
          </div>
        )}

        {sorted.map((grade, idx) => (
          <div key={grade.rosterId} className="border-b border-borderLow last:border-0">
            <button
              className="w-full text-left hover:bg-white/3 transition-colors"
              onClick={() => setExpanded(expanded === grade.rosterId ? null : grade.rosterId)}
            >
              {/* Desktop row */}
              <div className="hidden sm:grid grid-cols-[2rem_minmax(0,1fr)_5.5rem_5rem_3.5rem_5rem_6.5rem] gap-x-4 px-5 py-4 items-center">
                <span className="font-mono text-num text-mutedLow tabular-nums">{idx + 1}</span>
                <div className="min-w-0">
                  <div className="text-base font-semibold text-text truncate">{grade.teamName}</div>
                  <div className="text-small text-muted">{grade.ownerName}</div>
                </div>
                <span className="font-mono text-num text-right text-text tabular-nums">
                  {formatK(grade.totalDynastyValue)}
                </span>
                <span className="font-mono text-num text-right text-muted tabular-nums">
                  {Math.round(grade.totalProjPoints).toLocaleString()}
                </span>
                <span className="font-mono text-num text-right text-muted tabular-nums">
                  {grade.avgAge > 0 ? grade.avgAge.toFixed(1) : '—'}
                </span>
                <div className="h-1.5 rounded-full bg-surfaceHi overflow-hidden">
                  <div
                    className="h-full bg-gold/70 rounded-full transition-all duration-700"
                    style={{ width: `${(grade.totalDynastyValue / maxDynastyValue) * 100}%` }}
                  />
                </div>
                <div className="flex justify-end">
                  <span className={`px-2 py-0.5 rounded text-label font-semibold whitespace-nowrap ${GRADE_STYLES[grade.grade]}`}>
                    {grade.grade}
                  </span>
                </div>
              </div>

              {/* Mobile row */}
              <div className="sm:hidden grid grid-cols-[1.5rem_minmax(0,1fr)_5rem_5.5rem] gap-x-3 px-4 py-3.5 items-center">
                <span className="font-mono text-num text-mutedLow tabular-nums">{idx + 1}</span>
                <div className="min-w-0">
                  <div className="text-small font-semibold text-text truncate">{grade.teamName}</div>
                  <div className="text-label text-muted truncate">{grade.ownerName}</div>
                </div>
                <span className="font-mono text-num text-right text-text tabular-nums">
                  {formatK(grade.totalDynastyValue)}
                </span>
                <div className="flex justify-end">
                  <span className={`px-2 py-0.5 rounded text-label font-semibold whitespace-nowrap ${GRADE_STYLES[grade.grade]}`}>
                    {grade.grade}
                  </span>
                </div>
              </div>
            </button>

            {/* Expanded detail */}
            {expanded === grade.rosterId && (
              <div className="px-4 sm:px-5 pb-4 pt-2 bg-background/40 border-t border-borderLow">
                <div className="text-label font-bold text-mutedLow uppercase tracking-wide mb-2.5">
                  Top Players · {grade.picks} picks total
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {grade.topPlayers.map((p, i) => (
                    <span
                      key={i}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-label font-medium ${
                        POS_COLORS[p.position] ?? 'bg-surfaceHi text-muted border border-borderLow'
                      }`}
                    >
                      <span className="font-semibold">{p.name}</span>
                      <span className="opacity-40">·</span>
                      <span>{formatK(p.ktcValue)}</span>
                      <span className="opacity-40">·</span>
                      <span>{Math.round(p.projPts)}pts</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
