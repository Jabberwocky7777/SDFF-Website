import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useHub } from '@/components/hub/HubLayout'
import { getRookieDraftOrder, type RookieDraftOrder, type RookieOrderTeam } from '@/api/hub'
import SkeletonLoader from '@/components/ui/SkeletonLoader'
import ScrollTable from './ScrollTable'
import { EmptyState, Panel } from './shared'
import { fmtRecord } from '@/lib/formatters'

const GROUPS = {
  1: { label: 'Missed playoffs', chip: 'text-orange-300 bg-orange-900/30 border-orange-500/30' },
  2: { label: 'Playoffs · no payout', chip: 'text-indigo-300 bg-indigo-900/30 border-indigo-500/30' },
  3: { label: 'Payout', chip: 'text-emerald-300 bg-emerald-900/30 border-emerald-500/30' },
} as const

const PLACE = ['Champion', 'Runner-up', '3rd place', '4th place', '5th place', '6th place']

function fmtPoints(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtWhen(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
    timeZoneName: 'short',
  })
}

/** Why a team sits where it does, in one line. */
function basis(t: RookieOrderTeam, data: RookieDraftOrder): string {
  if (t.group === 3) {
    const place = PLACE[(t.moneyPlace ?? 1) - 1] ?? `#${t.moneyPlace}`
    return data.moneyBasis === 'final' ? place : `${place} (as ${t.seed} seed)`
  }
  if (t.group === 2) return `${t.seed} seed · reverse Max PF`
  return 'Reverse Max PF'
}

function Header({ data }: { data: RookieDraftOrder }) {
  const weeks =
    data.throughWeek === 1 ? 'week 1' : `weeks 1–${data.throughWeek}`
  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <h2 className="font-sans text-h2 font-bold text-text">{data.draftYear} Rookie Draft Order</h2>
        <span
          className={`text-label font-semibold uppercase tracking-[0.05em] px-2 py-0.5 rounded border ${
            data.status === 'final'
              ? 'text-emerald-300 border-emerald-500/30 bg-emerald-900/20'
              : 'text-gold border-gold/30 bg-gold/10'
          }`}
        >
          {data.status === 'final' ? 'Final' : 'If the season ended today'}
        </span>
      </div>
      <p className="text-body text-muted">
        {data.status === 'final'
          ? `Set by the completed ${data.season} season.`
          : `Based on finished ${data.season} results only — ${weeks} of ${data.regularSeasonWeeks}.`}
        {data.nextUpdateAt && (
          <> Week {data.throughWeek + 1} goes final {fmtWhen(data.nextUpdateAt)}; the order updates then.</>
        )}
      </p>
    </div>
  )
}

export default function HubRookieDraftOrder() {
  const { slug } = useHub()
  const { data, isLoading } = useQuery({
    queryKey: ['hub', slug, 'rookie-draft-order'],
    queryFn: () => getRookieDraftOrder(slug),
  })

  if (isLoading) return <SkeletonLoader rows={12} />
  if (!data || data.status === 'none') {
    return <EmptyState>No season on record yet — the draft order appears once games are played.</EmptyState>
  }
  if (data.status === 'waiting') {
    return (
      <EmptyState>
        No {data.season} week is final yet.
        {data.nextUpdateAt && <> The first projected order appears {fmtWhen(data.nextUpdateAt)}.</>}
      </EmptyState>
    )
  }

  const ownerOf = (round: number, rosterId: number) =>
    data.rounds[round - 1]?.find((p) => p.originalRosterId === rosterId)
  const anyTraded = data.rounds.some((r) => r.some((p) => p.traded))

  return (
    <div className="space-y-8">
      <div>
        <Header data={data} />
        <ScrollTable>
          <table className="w-full min-w-[680px]">
            <thead>
              <tr className="bg-surfaceHi border-b border-borderLow text-label text-muted uppercase tracking-[0.04em]">
                <th className="text-left font-semibold px-4 py-3 w-14">Pick</th>
                <th className="text-left font-semibold px-2 py-3">Manager</th>
                <th className="text-left font-semibold px-2 py-3">Group</th>
                <th className="text-center font-semibold px-2 py-3">Record</th>
                <th className="text-right font-semibold px-2 py-3">PF</th>
                <th className="text-right font-semibold px-2 py-3">Max PF</th>
                <th className="text-left font-semibold px-4 py-3">Why</th>
              </tr>
            </thead>
            <tbody>
              {data.teams.map((t, i) => {
                const pick = ownerOf(1, t.rosterId)
                const newGroup = i > 0 && data.teams[i - 1].group !== t.group
                return (
                  <tr
                    key={t.rosterId}
                    className={`border-b border-borderLow last:border-0 hover:bg-white/3 transition-colors ${
                      newGroup ? 'border-t-2 border-t-borderLow' : ''
                    }`}
                  >
                    <td className="px-4 py-3 font-mono text-num font-bold text-gold tabular">
                      {pick?.label ?? `1.${String(t.slot).padStart(2, '0')}`}
                    </td>
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
                      {pick?.traded && (
                        <div className="text-small text-gold">→ owned by {pick.ownerName}</div>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      <span className={`text-label font-semibold px-2 py-0.5 rounded border whitespace-nowrap ${GROUPS[t.group].chip}`}>
                        {GROUPS[t.group].label}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-center font-mono text-num tabular text-text">
                      {fmtRecord(t.wins, t.losses, t.ties)}
                    </td>
                    <td className="px-2 py-3 text-right font-mono text-num tabular text-muted">
                      {fmtPoints(t.pointsFor)}
                    </td>
                    <td className="px-2 py-3 text-right font-mono text-num tabular text-text font-semibold">
                      {fmtPoints(t.maxPointsFor)}
                    </td>
                    <td className="px-4 py-3 text-small text-muted whitespace-nowrap">{basis(t, data)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </ScrollTable>
      </div>

      <Panel title="All rounds · linear">
        {!anyTraded && (
          <p className="px-5 pt-4 text-small text-muted">
            No {data.draftYear} picks have changed hands — every team keeps its own slot in all{' '}
            {data.rounds.length} rounds.
          </p>
        )}
        <ScrollTable className="border-0 rounded-none">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="border-b border-borderLow text-label text-muted uppercase tracking-[0.04em]">
                <th className="text-left font-semibold px-5 py-3">Slot</th>
                {data.rounds.map((_, r) => (
                  <th key={r} className="text-left font-semibold px-2 py-3">Round {r + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.teams.map((t) => (
                <tr key={t.rosterId} className="border-b border-borderLow last:border-0">
                  <td className="px-5 py-2.5 text-small text-text whitespace-nowrap">
                    <span className="font-mono text-mutedLow mr-2">{t.slot}</span>
                    {t.name}
                  </td>
                  {data.rounds.map((round, r) => {
                    const p = round.find((x) => x.originalRosterId === t.rosterId)
                    if (!p) return <td key={r} />
                    return (
                      <td key={r} className="px-2 py-2.5 text-small whitespace-nowrap">
                        <span className="font-mono text-mutedLow mr-1.5">{p.label}</span>
                        <span className={p.traded ? 'text-gold font-semibold' : 'text-muted'}>
                          {p.traded ? p.ownerName : 'Own'}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTable>
      </Panel>

      <div className="bg-surface border border-borderLow rounded-lg p-5 space-y-2 text-small text-muted leading-relaxed">
        <div className="text-label uppercase font-bold text-muted">How the order is set</div>
        <p>
          <span className="text-text font-semibold">Picks 1–{data.teams.length - data.playoffTeams}:</span>{' '}
          non-playoff teams, lowest Max Points For first.{' '}
          <span className="text-text font-semibold">
            Picks {data.teams.length - data.playoffTeams + 1}–{data.teams.length - data.paidPlaces}:
          </span>{' '}
          playoff teams that don&apos;t earn prize money, lowest Max PF first.{' '}
          <span className="text-text font-semibold">
            Picks {data.teams.length - data.paidPlaces + 1}–{data.teams.length}:
          </span>{' '}
          reverse payout order — the champion picks last. The regular-season payout doesn&apos;t count.
        </p>
        <p>
          Playoff field: seeds 1–{data.playoffTeams - 1} by record
          {data.hasMedianScoring ? ' (H2H + median wins)' : ''}, points-for tiebreak; the{' '}
          {data.playoffTeams} seed to the most points among the rest
          {data.playoffField === 'bracket' ? ' — taken from the actual playoff bracket now that it’s set' : ''}.
          {data.moneyBasis === 'seed' &&
            ` Until the playoffs are played, prize money is projected by seed (1 seed = champion).`}{' '}
          Max PF is each week&apos;s best possible lineup, regular season only. A Max PF tie goes to the team
          with fewer actual points.
        </p>
        <p>
          Only finished weeks count: a week is final the Tuesday morning after its Monday-night game, so live
          scores from a week in progress never move the order.
        </p>
      </div>
    </div>
  )
}
