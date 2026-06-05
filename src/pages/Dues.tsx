import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { duesRecords, championshipHistory, DUES_YEARS } from '@/data/dues'
import { LEAGUE_CONFIG } from '@/data/leagueConfig'
import type { DuesRecord, PaymentStatus, ChampionshipRecord } from '@/data/dues'

const ROLE_LABEL: Record<string, string> = {
  commissioner: 'Commissioner',
  'co-commissioner': 'Co-Comm',
}

function PaymentBadge({ status }: { status: string }) {
  if (status === 'paid') {
    return (
      <span className="inline-flex items-center gap-1 bg-green-900/40 text-green-400 text-label font-semibold px-2 py-0.5 rounded">
        ✓ Paid
      </span>
    )
  }
  if (status === 'unpaid') {
    return (
      <span className="inline-flex items-center gap-1 bg-red-900/40 text-red-400 text-label font-semibold px-2 py-0.5 rounded">
        ✗ Unpaid
      </span>
    )
  }
  return <span className="text-mutedLow text-label">—</span>
}

function RoleBadge({ role }: { role?: string }) {
  if (!role) return null
  return (
    <span className="text-label font-semibold bg-goldLow text-gold px-2 py-0.5 rounded-full shrink-0">
      {ROLE_LABEL[role] ?? role}
    </span>
  )
}

const sortedRecords = [...duesRecords].sort((a, b) =>
  a.managerName.localeCompare(b.managerName),
)

const currentYear = new Date().getFullYear()
const seasonsCompleted = Math.max(0, currentYear - 2026)
const squadPotBalance = seasonsCompleted * LEAGUE_CONFIG.squadPotContributionPerYear

export default function Dues() {
  const { data: duesOverrides = {} } = useQuery<Record<string, PaymentStatus>>({
    queryKey: ['dues-overrides'],
    queryFn: () => apiFetch('/api/dues-overrides'),
  })

  const { data: championshipOverrides = [] } = useQuery<ChampionshipRecord[]>({
    queryKey: ['championship-overrides'],
    queryFn: () => apiFetch('/api/championship-overrides'),
  })

  const { data: squadPotData } = useQuery<{ balance: number | null }>({
    queryKey: ['squad-pot'],
    queryFn: () => apiFetch('/api/squad-pot'),
  })

  const isSquadPotManual = squadPotData?.balance != null
  const displaySquadPotBalance = isSquadPotManual ? squadPotData!.balance : squadPotBalance

  const mergedChampionshipHistory: ChampionshipRecord[] = championshipHistory.map((rec) => {
    const override = championshipOverrides.find((o) => o.year === rec.year)
    return override ? { ...rec, ...override } : rec
  })

  function getMergedPaymentStatus(managerName: string, year: number): PaymentStatus {
    const key = `${managerName}_${year}`
    if (key in duesOverrides) return duesOverrides[key]
    const record = duesRecords.find((r) => r.managerName === managerName)
    return record?.payments[String(year)] ?? 'na'
  }

  function getChampCount(managerName: string): number {
    return mergedChampionshipHistory.filter((r) => r.champion === managerName).length
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-sans text-h1 sm:text-hero font-bold text-text mb-2">Dues & Payouts</h1>
        <p className="text-body text-muted leading-relaxed max-w-2xl">
          Track annual dues, the Squad Pot jackpot, and the payout structure.
        </p>
      </div>

      {/* ── Section A: Payment Grid ─────────────────────────────────────────── */}
      <section>
        <h2 className="font-sans text-h2 font-bold text-text mb-1">Payment Status</h2>
        <p className="text-base text-muted mb-5 leading-relaxed">
          All 12 managers are paid through 2027. Trading future rookie picks requires both managers to have
          paid dues for that year — the commissioner must confirm payment before approving the trade.
        </p>

        <div className="bg-surface border border-borderLow rounded-lg overflow-x-auto">
          {/* Header */}
          <div className="grid bg-surfaceHi border-b border-borderLow px-4 py-3 min-w-[34rem]"
               style={{ gridTemplateColumns: `1fr repeat(${DUES_YEARS.length}, 6.5rem)` }}>
            <div className="text-label text-muted uppercase tracking-[0.04em] font-semibold sticky left-0 z-10 bg-surfaceHi">Manager</div>
            {DUES_YEARS.map((year) => (
              <div key={year} className="text-label text-muted uppercase tracking-[0.04em] font-semibold text-center">
                {year}
              </div>
            ))}
          </div>

          {/* Rows */}
          {sortedRecords.map((rec: DuesRecord) => (
            <div
              key={rec.managerName}
              className="grid border-b border-borderLow last:border-0 px-4 py-3 hover:bg-white/3 transition-colors min-w-[34rem]"
              style={{ gridTemplateColumns: `1fr repeat(${DUES_YEARS.length}, 6.5rem)` }}
            >
              <div className="flex items-center gap-2 min-w-0 sticky left-0 z-10 bg-surface">
                <span className="text-base font-semibold text-text truncate">{rec.managerName}</span>
                {rec.role && <RoleBadge role={rec.role} />}
              </div>
              {DUES_YEARS.map((year) => (
                <div key={year} className="flex items-center justify-center">
                  <PaymentBadge status={getMergedPaymentStatus(rec.managerName, year)} />
                </div>
              ))}
            </div>
          ))}
        </div>

        <p className="text-small text-muted mt-3 italic">
          Venmo dues to Brendan Shrum: <span className="text-gold font-semibold">@Brendan-Shrum</span>
        </p>
      </section>

      {/* ── Section B: Squad Pot ────────────────────────────────────────────── */}
      <section>
        <h2 className="font-sans text-h2 font-bold text-text mb-1">Squad Pot Jackpot</h2>
        <p className="text-base text-muted mb-5 leading-relaxed">
          $100 is removed from the annual pot each year and added to a growing jackpot. The pot can be claimed by
          winning back-to-back championships or winning 3 championships all-time. If the league dissolves, it is split evenly.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-surface border border-border rounded-lg p-5 text-center">
            <div className="text-label text-muted uppercase font-semibold mb-1">Current Balance</div>
            <div className="text-numLg font-bold text-gold">${displaySquadPotBalance}</div>
            <div className="text-small text-muted mt-1">
              {isSquadPotManual
                ? '(manually set)'
                : seasonsCompleted === 0
                ? 'Grows by $100 after each completed season'
                : `After ${seasonsCompleted} season${seasonsCompleted > 1 ? 's' : ''}`}
            </div>
          </div>

          <div className="bg-surface border border-borderLow rounded-lg p-4">
            <div className="text-label text-gold uppercase font-bold mb-2">Trigger #1</div>
            <p className="text-base text-text font-semibold">Back-to-Back Champion</p>
            <p className="text-small text-muted mt-1">Win the championship two consecutive seasons.</p>
          </div>

          <div className="bg-surface border border-borderLow rounded-lg p-4">
            <div className="text-label text-gold uppercase font-bold mb-2">Trigger #2</div>
            <p className="text-base text-text font-semibold">3 All-Time Championships</p>
            <p className="text-small text-muted mt-1">Win 3 championships total across any seasons.</p>
          </div>
        </div>

        {/* Championship history */}
        <div className="bg-surface border border-borderLow rounded-lg overflow-x-auto mb-4">
          <div className="bg-surfaceHi border-b border-borderLow px-4 py-3">
            <div className="text-label text-muted uppercase tracking-[0.04em] font-semibold">Championship History</div>
          </div>
          <div className="grid bg-surfaceHi border-b border-borderLow px-4 py-2 min-w-[640px]"
               style={{ gridTemplateColumns: '4rem 1fr 1fr 1fr 1fr' }}>
            {['Year', 'Champion', 'Runner-Up', '3rd Place', 'Reg. Season Winner'].map((h) => (
              <div key={h} className="text-label text-muted uppercase tracking-[0.04em] font-semibold">{h}</div>
            ))}
          </div>
          {mergedChampionshipHistory.map((rec) => (
            <div
              key={rec.year}
              className="grid border-b border-borderLow last:border-0 px-4 py-3 min-w-[640px]"
              style={{ gridTemplateColumns: '4rem 1fr 1fr 1fr 1fr' }}
            >
              <span className="font-mono text-num text-text">{rec.year}</span>
              <span className="text-base text-text font-semibold">{rec.champion ?? <span className="text-muted italic">TBD</span>}</span>
              <span className="text-base text-muted">{rec.runnerUp ?? <span className="italic">TBD</span>}</span>
              <span className="text-base text-muted">{rec.thirdPlace ?? <span className="italic">TBD</span>}</span>
              <span className="text-base text-muted">{rec.regularSeasonWinner ?? <span className="italic">TBD</span>}</span>
            </div>
          ))}
        </div>

        {/* Per-manager championship progress */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {sortedRecords.map((rec) => {
            const count = getChampCount(rec.managerName)
            const backToBackPossible = (() => {
              const years = mergedChampionshipHistory.map((r) => r.year).sort((a, b) => a - b)
              for (let i = 0; i < years.length - 1; i++) {
                if (
                  mergedChampionshipHistory.find((r) => r.year === years[i])?.champion === rec.managerName &&
                  mergedChampionshipHistory.find((r) => r.year === years[i + 1])?.champion === rec.managerName
                ) return true
              }
              return false
            })()

            return (
              <div key={rec.managerName} className="bg-surface border border-borderLow rounded-lg p-3">
                <div className="text-base font-semibold text-text mb-1">{rec.managerName}</div>
                <div className="text-small text-muted">
                  <span className="font-mono text-gold font-bold">{count}</span>
                  {' '}championship{count !== 1 ? 's' : ''}
                </div>
                {backToBackPossible ? (
                  <div className="text-label text-gold mt-1 font-bold">🏆 Back-to-back!</div>
                ) : count >= 3 ? (
                  <div className="text-label text-gold mt-1 font-bold">🏆 3 all-time!</div>
                ) : (
                  <div className="text-label text-mutedLow mt-1">
                    {3 - count} win{3 - count !== 1 ? 's' : ''} needed (all-time trigger)
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Section C: Payout Structure ─────────────────────────────────────── */}
      <section>
        <h2 className="font-sans text-h2 font-bold text-text mb-1">Annual Payout Structure</h2>
        <p className="text-base text-muted mb-5 leading-relaxed">
          Gross pool is $1,200 (12 managers × $100). $100 goes to the Squad Pot; $1,100 is distributed.
        </p>

        <div className="bg-surface border border-borderLow rounded-lg overflow-hidden max-w-md">
          {[
            { label: 'Champion', amount: LEAGUE_CONFIG.payouts.champion, highlight: true },
            { label: 'Runner-Up', amount: LEAGUE_CONFIG.payouts.runnerUp, highlight: false },
            { label: '3rd Place', amount: LEAGUE_CONFIG.payouts.thirdPlace, highlight: false },
            { label: 'Regular Season Winner', amount: LEAGUE_CONFIG.payouts.regularSeasonWinner, highlight: false },
            { label: 'Squad Pot Contribution', amount: LEAGUE_CONFIG.squadPotContributionPerYear, highlight: false, muted: true },
          ].map(({ label, amount, highlight, muted }) => (
            <div
              key={label}
              className={`flex items-center justify-between px-5 py-3.5 border-b border-borderLow last:border-0 ${
                highlight ? 'bg-goldLow' : ''
              }`}
            >
              <span className={`text-base font-medium ${muted ? 'text-muted' : 'text-text'}`}>{label}</span>
              <span className={`font-mono text-num font-bold ${highlight ? 'text-gold' : muted ? 'text-muted' : 'text-text'}`}>
                ${amount}
              </span>
            </div>
          ))}

          <div className="flex items-center justify-between px-5 py-3.5 bg-surfaceHi border-t border-borderLow">
            <span className="text-base font-bold text-text">Total Distributed</span>
            <span className="font-mono text-num font-bold text-text">
              ${LEAGUE_CONFIG.payouts.champion + LEAGUE_CONFIG.payouts.runnerUp +
                LEAGUE_CONFIG.payouts.thirdPlace + LEAGUE_CONFIG.payouts.regularSeasonWinner}
            </span>
          </div>
          <div className="flex items-center justify-between px-5 py-3 bg-surfaceHi border-t border-borderLow">
            <span className="text-small text-muted">Gross pool (all dues)</span>
            <span className="font-mono text-small text-muted">
              ${(LEAGUE_CONFIG.payouts.champion + LEAGUE_CONFIG.payouts.runnerUp +
                LEAGUE_CONFIG.payouts.thirdPlace + LEAGUE_CONFIG.payouts.regularSeasonWinner +
                LEAGUE_CONFIG.squadPotContributionPerYear)}
            </span>
          </div>
        </div>
      </section>
    </div>
  )
}
