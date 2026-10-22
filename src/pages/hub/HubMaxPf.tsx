import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useHub } from '@/components/hub/HubLayout'
import {
  getMaxPfSeason,
  getMaxPfWeek,
  getMaxPfWeeks,
  type MaxPfBlunder,
  type MaxPfLineupSlot,
  type MaxPfTeamWeek,
} from '@/api/hub'
import SkeletonLoader from '@/components/ui/SkeletonLoader'
import ShieldAvatar from '@/components/ui/ShieldAvatar'
import { avatarUrl, fmtPct, fmtPts } from '@/lib/formatters'
import ScrollTable from './ScrollTable'
import SeasonPills from './SeasonPills'
import { EmptyState } from './shared'

const TAXI_KEY = 'sdff:max-pf:include-taxi'

/** Taxi is on by default — that's the basis Sleeper's own Max PF uses. */
function readTaxiPref(): boolean {
  try {
    return window.localStorage.getItem(TAXI_KEY) !== '0'
  } catch {
    return true
  }
}

function writeTaxiPref(on: boolean): void {
  try {
    window.localStorage.setItem(TAXI_KEY, on ? '1' : '0')
  } catch {
    /* private mode, blocked storage — the toggle just won't be remembered */
  }
}

/** Sleeper's slot names, shortened for a narrow column. */
const SLOT_LABELS: Record<string, string> = {
  SUPER_FLEX: 'SFLX',
  WRRB_FLEX: 'W/R',
  REC_FLEX: 'W/T',
  IDP_FLEX: 'IDP',
}

const slotLabel = (slot: string) => SLOT_LABELS[slot] ?? slot

function StatusBadge({ status }: { status: 'taxi' | 'ir' }) {
  const tone =
    status === 'taxi'
      ? 'text-amber-300 border-amber-500/30 bg-amber-900/20'
      : 'text-rose-300 border-rose-500/30 bg-rose-900/20'
  return (
    <span
      className={`text-label font-semibold uppercase tracking-[0.05em] px-1.5 py-px rounded border ${tone}`}
      title={status === 'taxi' ? 'On the taxi squad that week' : 'On injured reserve that week'}
    >
      {status === 'taxi' ? 'Taxi' : 'IR'}
    </span>
  )
}

function EfficiencyBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 rounded-full bg-white/8 overflow-hidden" aria-hidden>
      <div
        className="h-full rounded-full bg-gold"
        style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }}
      />
    </div>
  )
}

function LineupRow({ slot }: { slot: MaxPfLineupSlot }) {
  const empty = slot.playerId == null
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded-md ${
        !empty && !slot.startedActually ? 'bg-gold/10 border border-gold/25' : 'border border-transparent'
      }`}
    >
      <span className="font-mono text-label text-mutedLow w-11 shrink-0 uppercase">
        {slotLabel(slot.slot)}
      </span>
      <div className="min-w-0 flex-1">
        {empty ? (
          <span className="text-small text-mutedLow italic">Nobody worth starting</span>
        ) : (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-small font-semibold text-text truncate">
              {slot.playerName ?? slot.playerId}
            </span>
            {slot.status && <StatusBadge status={slot.status} />}
            {!slot.startedActually && (
              <span className="text-label text-gold font-semibold uppercase tracking-[0.05em]">
                Benched
              </span>
            )}
          </div>
        )}
        {!empty && (
          <div className="text-label text-mutedLow">
            {[slot.position, slot.nflTeam].filter(Boolean).join(' · ') || '—'}
          </div>
        )}
      </div>
      <span className="font-mono text-num tabular text-text shrink-0">{fmtPts(slot.points)}</span>
    </div>
  )
}

function TeamCard({
  team,
  rank,
  slug,
  expanded,
  onToggle,
}: {
  team: MaxPfTeamWeek
  rank: number
  slug: string
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div className="bg-surface border border-borderLow rounded-lg">
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full text-left px-4 py-3.5 flex items-start gap-3 hover:bg-white/3 transition-colors rounded-lg"
      >
        <span className="font-mono text-num text-mutedLow tabular w-5 shrink-0 pt-1">{rank}</span>
        <ShieldAvatar avatarUrl={avatarUrl(team.avatar)} teamName={team.name} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold text-text truncate">{team.name}</span>
            <span className="font-mono text-num tabular shrink-0">
              <span className="text-text font-semibold">{fmtPts(team.actual)}</span>
              <span className="text-mutedLow"> of {fmtPts(team.max)}</span>
            </span>
          </div>
          {team.teamName && (
            <div className="text-label text-mutedLow truncate">{team.teamName}</div>
          )}
          <div className="mt-2">
            <EfficiencyBar value={team.efficiency} />
          </div>
          <div className="flex items-center justify-between gap-2 mt-1.5">
            <span className="text-small text-gold font-semibold tabular">
              {fmtPct(team.efficiency)}
            </span>
            <span className="text-label text-mutedLow tabular">
              {fmtPts(team.leftOnBench)} left on the bench
            </span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-borderLow pt-3 space-y-3">
          <div>
            <div className="text-label text-muted uppercase tracking-[0.06em] font-semibold mb-1.5">
              Best lineup
            </div>
            <div className="space-y-0.5">
              {team.bestLineup.map((slot, i) => (
                <LineupRow key={`${slot.slot}-${slot.playerId ?? i}`} slot={slot} />
              ))}
            </div>
          </div>

          {team.shouldHaveSat.length > 0 && (
            <div>
              <div className="text-label text-muted uppercase tracking-[0.06em] font-semibold mb-1.5">
                Should have sat
              </div>
              <div className="space-y-0.5">
                {team.shouldHaveSat.map((p) => (
                  <div key={p.playerId} className="flex items-center gap-3 px-3 py-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-small text-muted truncate">
                        {p.playerName ?? p.playerId}
                      </div>
                      <div className="text-label text-mutedLow">
                        {[p.position, p.nflTeam].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </div>
                    <span className="font-mono text-num tabular text-mutedLow shrink-0">
                      {fmtPts(p.points)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {team.userId && (
            <Link
              to={`/l/${slug}/managers/${team.userId}`}
              className="inline-block text-small text-gold hover:brightness-125 transition-all"
            >
              {team.name}&rsquo;s profile →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

function BlunderCallout({ blunder, scope }: { blunder: MaxPfBlunder; scope: 'week' | 'season' }) {
  return (
    <div className="bg-gold/10 border border-gold/25 rounded-lg px-5 py-4 mb-5">
      <div className="text-label text-gold uppercase tracking-[0.06em] font-semibold mb-1">
        Biggest bench blunder{scope === 'season' ? ' of the season' : ''}
      </div>
      <p className="text-body text-text">
        <span className="font-semibold">{blunder.name}</span> left{' '}
        <span className="font-mono tabular font-semibold">{fmtPts(blunder.leftOnBench)}</span> points
        on the bench
        {scope === 'season' ? ` in week ${blunder.week}` : ''} — {fmtPts(blunder.actual)} of a
        possible {fmtPts(blunder.max)}.
      </p>
    </div>
  )
}

function TaxiToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      className={`flex items-center gap-2 px-3 py-1.5 text-small font-semibold rounded-md border transition-colors ${
        on
          ? 'bg-goldLow text-gold border-gold/30'
          : 'bg-surface text-muted border-borderLow hover:text-text hover:border-border'
      }`}
    >
      <span
        aria-hidden
        className={`w-8 h-4 rounded-full relative transition-colors ${on ? 'bg-gold' : 'bg-white/8'}`}
      >
        <span
          className={`absolute top-0.5 w-3 h-3 rounded-full bg-background transition-all ${
            on ? 'left-4' : 'left-0.5'
          }`}
        />
      </span>
      Include taxi
    </button>
  )
}

function WeekStrip({
  weeks,
  value,
  onChange,
}: {
  weeks: number[]
  value: number | 'season'
  onChange: (w: number | 'season') => void
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button
        onClick={() => onChange('season')}
        className={`px-3 py-1.5 text-small font-semibold rounded-md border transition-colors ${
          value === 'season'
            ? 'bg-gold text-[#1A1100] border-gold'
            : 'bg-surface text-muted border-borderLow hover:text-text hover:border-border'
        }`}
      >
        Season
      </button>
      {weeks.map((w) => (
        <button
          key={w}
          onClick={() => onChange(w)}
          className={`w-10 py-1.5 text-small font-semibold rounded-md border transition-colors font-mono tabular ${
            w === value
              ? 'bg-gold text-[#1A1100] border-gold'
              : 'bg-surface text-muted border-borderLow hover:text-text hover:border-border'
          }`}
        >
          {w}
        </button>
      ))}
    </div>
  )
}

/**
 * Max PF — "what you scored out of what you could have scored".
 *
 * The weekly view mirrors Sleeper's own report and then goes further: each team
 * expands to the lineup it should have started, with the bench players who
 * belonged in it highlighted and the starters who didn't make the cut listed
 * underneath.
 */
export default function HubMaxPf() {
  const { slug, meta } = useHub()
  const [season, setSeason] = useState<number | null>(null)
  const [view, setView] = useState<number | 'season' | null>(null)
  const [includeTaxi, setIncludeTaxi] = useState(readTaxiPref)
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    writeTaxiPref(includeTaxi)
  }, [includeTaxi])

  const weeksQuery = useQuery({
    queryKey: ['hub', slug, 'max-pf-weeks'],
    queryFn: () => getMaxPfWeeks(slug),
  })

  const activeSeason = season ?? weeksQuery.data?.[0]?.season ?? null
  const seasonEntry = useMemo(
    () => weeksQuery.data?.find((s) => s.season === activeSeason) ?? null,
    [weeksQuery.data, activeSeason],
  )
  // Default to the most recent finished week — the one people came to argue about.
  const activeView = view ?? seasonEntry?.weeks[seasonEntry.weeks.length - 1] ?? null

  const weekQuery = useQuery({
    queryKey: ['hub', slug, 'max-pf', activeSeason, activeView, includeTaxi],
    queryFn: () => getMaxPfWeek(slug, activeSeason as number, activeView as number, includeTaxi),
    enabled: activeSeason != null && typeof activeView === 'number',
  })

  const seasonQuery = useQuery({
    queryKey: ['hub', slug, 'max-pf-season', activeSeason, includeTaxi],
    queryFn: () => getMaxPfSeason(slug, activeSeason as number, includeTaxi),
    enabled: activeSeason != null && activeView === 'season',
  })

  if (weeksQuery.isLoading) return <SkeletonLoader rows={6} />
  if (!weeksQuery.data || weeksQuery.data.length === 0) {
    return (
      <EmptyState>
        No finished weeks on record for {meta.displayName} yet — Max PF appears once a week has
        gone final.
      </EmptyState>
    )
  }

  const data = activeView === 'season' ? seasonQuery.data : weekQuery.data
  const loading = activeView === 'season' ? seasonQuery.isLoading : weekQuery.isLoading
  const taxiInferred = data?.taxiInferred === true
  const hasTaxiSquad = data?.hasTaxiSquad === true

  return (
    <div>
      <p className="text-body text-muted max-w-2xl mb-5">
        What each team scored out of the best lineup it could have started that week. Sleeper counts
        every rostered player, taxi squad and IR included — which is what &ldquo;Include taxi&rdquo;
        matches.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <SeasonPills
          seasons={weeksQuery.data.map((s) => s.season)}
          value={activeSeason}
          onChange={(s) => {
            setSeason(s)
            setView(null)
            setExpanded(null)
          }}
        />
        {hasTaxiSquad && <TaxiToggle on={includeTaxi} onChange={setIncludeTaxi} />}
      </div>

      {seasonEntry && (
        <WeekStrip
          weeks={seasonEntry.weeks}
          value={activeView ?? 'season'}
          onChange={(v) => {
            setView(v)
            setExpanded(null)
          }}
        />
      )}

      <div className="mt-6">
        {loading || !data ? (
          <SkeletonLoader rows={6} />
        ) : activeView === 'season' && seasonQuery.data ? (
          <>
            {seasonQuery.data.blunder && (
              <BlunderCallout blunder={seasonQuery.data.blunder} scope="season" />
            )}
            <ScrollTable>
              <table className="w-full min-w-[620px]">
                <thead>
                  <tr className="bg-surfaceHi border-b border-borderLow text-label text-muted uppercase tracking-[0.04em]">
                    <th className="text-left font-semibold px-4 py-3 w-10">#</th>
                    <th className="text-left font-semibold px-2 py-3">Manager</th>
                    <th className="text-right font-semibold px-2 py-3">Weeks</th>
                    <th className="text-right font-semibold px-2 py-3">PF</th>
                    <th className="text-right font-semibold px-2 py-3">Max PF</th>
                    <th className="text-right font-semibold px-2 py-3">Left on bench</th>
                    <th className="text-right font-semibold px-4 py-3">Efficiency</th>
                  </tr>
                </thead>
                <tbody>
                  {seasonQuery.data.teams.map((t, i) => (
                    <tr
                      key={t.rosterId}
                      className="border-b border-borderLow last:border-0 hover:bg-white/3 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-num text-mutedLow tabular">{i + 1}</td>
                      <td className="px-2 py-3">
                        {t.userId ? (
                          <Link
                            to={`/l/${slug}/managers/${t.userId}`}
                            className="font-semibold text-text hover:text-gold transition-colors"
                          >
                            {t.name}
                          </Link>
                        ) : (
                          <span className="font-semibold text-text">{t.name}</span>
                        )}
                        {t.teamName && (
                          <div className="text-label text-mutedLow truncate">{t.teamName}</div>
                        )}
                      </td>
                      <td className="px-2 py-3 text-right font-mono text-num tabular text-mutedLow">
                        {t.weeks}
                      </td>
                      <td className="px-2 py-3 text-right font-mono text-num tabular text-muted">
                        {fmtPts(t.actual)}
                      </td>
                      <td className="px-2 py-3 text-right font-mono text-num tabular text-text font-semibold">
                        {fmtPts(t.max)}
                      </td>
                      <td className="px-2 py-3 text-right font-mono text-num tabular text-muted">
                        {fmtPts(t.leftOnBench)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-num tabular text-gold font-semibold">
                        {fmtPct(t.efficiency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollTable>
          </>
        ) : weekQuery.data ? (
          <>
            {weekQuery.data.blunder && (
              <BlunderCallout blunder={weekQuery.data.blunder} scope="week" />
            )}
            <div className="grid gap-3 lg:grid-cols-2">
              {weekQuery.data.teams.map((t, i) => (
                <TeamCard
                  key={t.rosterId}
                  team={t}
                  rank={i + 1}
                  slug={slug}
                  expanded={expanded === t.rosterId}
                  onToggle={() => setExpanded(expanded === t.rosterId ? null : t.rosterId)}
                />
              ))}
            </div>
          </>
        ) : (
          <EmptyState>Nothing recorded for that week.</EmptyState>
        )}
      </div>

      {taxiInferred && (
        <p className="text-label text-mutedLow mt-5">
          Taxi status inferred from the current taxi squads. Under the bylaws taxi locks before the
          week 1 kickoff and a player only leaves it by being activated, so this is exact except for
          anyone activated mid-season.
        </p>
      )}
    </div>
  )
}
