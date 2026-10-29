/**
 * KeepTradeCut presentation bits for the trade pages.
 *
 * Everything here renders nothing at all when the value is missing, which is
 * the common case outside dynasty: the server sends `null` for redraft
 * families, for FAAB, and for any asset KTC has never ranked.
 */
import type { KtcAssetValue, KtcBalance, KtcBalanceLabel, TradeSideView } from '@/api/hub'
import { fmtKtc } from '@/lib/formatters'

const LABEL_TEXT: Record<KtcBalanceLabel, string> = {
  even: 'Even',
  slight: 'Slight edge',
  clear: 'Clear edge',
  lopsided: 'Lopsided',
}

const LABEL_CLASS: Record<KtcBalanceLabel, string> = {
  even: 'text-mutedLow border-borderLow',
  slight: 'text-muted border-borderLow',
  clear: 'text-gold/90 border-gold/30',
  lopsided: 'text-gold border-gold/50',
}

/** The at-trade gap as a scannable pill — "Lopsided +38%". */
export function BalanceBadge({ balance }: { balance: KtcBalance | null }) {
  if (!balance?.label || balance.gapPctAtTrade == null) return null
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-label font-semibold uppercase tracking-[0.04em] ${LABEL_CLASS[balance.label]}`}
      title="KeepTradeCut value gap between the sides on the day of the trade"
    >
      {LABEL_TEXT[balance.label]} +{balance.gapPctAtTrade.toFixed(0)}%
    </span>
  )
}

/** "KTC 6,000 → 7,500  +1,500 (+25%)" for one asset. */
export function AssetKtc({ ktc }: { ktc: KtcAssetValue | null }) {
  if (!ktc) return null

  if (ktc.atTrade == null) {
    return (
      <div className="text-small text-mutedLow mt-0.5">
        KTC {ktc.now != null ? `${fmtKtc(ktc.now)} now` : '—'}
        <span className="italic"> · value at trade unavailable</span>
      </div>
    )
  }

  const up = (ktc.change ?? 0) > 0
  const flat = (ktc.change ?? 0) === 0
  return (
    <div
      className="text-small text-mutedLow mt-0.5 font-mono tabular"
      title={
        ktc.atTradeDate
          ? `KTC value on ${ktc.atTradeDate}${ktc.nowDate ? `, latest from ${ktc.nowDate}` : ''}`
          : undefined
      }
    >
      KTC {fmtKtc(ktc.atTrade)}
      {' → '}
      {ktc.now != null ? fmtKtc(ktc.now) : '—'}
      {ktc.change != null && (
        <span className={flat ? 'text-mutedLow' : up ? 'text-green-400' : 'text-red-400'}>
          {' '}
          {flat ? '±0' : `${up ? '▲' : '▼'} ${fmtKtc(Math.abs(ktc.change))}`}
          {ktc.changePct != null && !flat && ` (${up ? '+' : ''}${ktc.changePct.toFixed(0)}%)`}
        </span>
      )}
    </div>
  )
}

/**
 * How the value split at the time of the trade, as one bar per side. Widths are
 * each side's share of the total, so a 3-team deal reads the same way a 2-team
 * one does.
 */
export function BalanceBar({
  balance,
  sides,
}: {
  balance: KtcBalance | null
  sides: TradeSideView[]
}) {
  if (!balance) return null
  const totals = balance.sides.filter((s) => s.atTrade != null)
  if (totals.length < 2) return null
  const sum = totals.reduce((acc, s) => acc + (s.atTrade ?? 0), 0)
  if (sum <= 0) return null

  const nameOf = (userId: string) => sides.find((s) => s.userId === userId)?.name ?? userId

  return (
    <div className="bg-surface border border-borderLow rounded-lg p-4 mb-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2.5">
        <h3 className="text-label text-muted uppercase tracking-[0.06em] font-semibold">
          Value at the time of the trade
        </h3>
        <BalanceBadge balance={balance} />
      </div>

      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-borderLow">
        {totals.map((s, i) => (
          <div
            key={s.userId}
            className={i === 0 ? 'bg-gold' : i === 1 ? 'bg-gold/45' : 'bg-gold/25'}
            style={{ width: `${((s.atTrade ?? 0) / sum) * 100}%` }}
            title={`${nameOf(s.userId)} — ${fmtKtc(s.atTrade ?? 0)}`}
          />
        ))}
      </div>

      <div className="mt-2.5 grid gap-1 sm:grid-cols-2">
        {totals.map((s) => (
          <div key={s.userId} className="flex items-baseline justify-between gap-2">
            <span className="text-small text-muted truncate">{nameOf(s.userId)}</span>
            <span className="font-mono text-small tabular text-text">
              {fmtKtc(s.atTrade ?? 0)}
              {s.now != null && <span className="text-mutedLow"> · {fmtKtc(s.now)} now</span>}
            </span>
          </div>
        ))}
      </div>

      <p className="text-small text-mutedLow mt-2.5">
        KeepTradeCut superflex values (not TE-premium — KTC publishes no
        TE-premium history), summed without KTC&apos;s own consolidation
        adjustment.
        {balance.gapAtTrade != null && (
          <>
            {' '}
            A {fmtKtc(balance.gapAtTrade)}-point gap then
            {balance.gapNow != null && `, ${fmtKtc(balance.gapNow)} now`}.
          </>
        )}
        {balance.incomplete && ' Some assets could not be priced, so this is partial.'}
      </p>
    </div>
  )
}
