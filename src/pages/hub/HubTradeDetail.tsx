import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useHub } from '@/components/hub/HubLayout'
import { getTrade, type TradeAssetView, type TradeSideView } from '@/api/hub'
import SkeletonLoader from '@/components/ui/SkeletonLoader'
import { EmptyState, fmtSigned } from './shared'

function AssetRow({ a }: { a: TradeAssetView }) {
  const valued = a.type === 'player' || (a.type === 'pick' && a.resolutionStatus === 'resolved')
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-borderLow last:border-0">
      <div className="min-w-0">
        <div className="text-base text-text truncate">
          {a.label}
          {a.stillRostered && (
            <span className="ml-2 text-label text-green-400 uppercase tracking-wide">still rostered</span>
          )}
          {a.type === 'pick' && a.resolutionStatus === 'pending' && (
            <span className="ml-2 text-label text-mutedLow uppercase tracking-wide">not drafted yet</span>
          )}
        </div>
        {valued && (
          <div className="text-small text-mutedLow mt-0.5">
            {a.weeksStarted} start{a.weeksStarted === 1 ? '' : 's'} · {a.weeksRostered} wk rostered
          </div>
        )}
      </div>
      {valued && (
        <div className="text-right shrink-0">
          <div className="font-mono text-base font-semibold text-text tabular">
            {a.pointsStarted.toFixed(1)}
          </div>
          <div className="text-label text-mutedLow uppercase">PAR {fmtSigned(a.par)}</div>
        </div>
      )}
    </div>
  )
}

function Side({ side, leading }: { side: TradeSideView; leading: boolean }) {
  return (
    <div className={`bg-surface border rounded-lg p-4 ${leading ? 'border-gold/40' : 'border-borderLow'}`}>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-h3 font-bold text-text">{side.name}</h3>
        <div className="text-right">
          <div className="font-mono text-numLg font-bold text-gold tabular">
            {side.totals.pointsStarted.toFixed(1)}
          </div>
          <div className="text-label text-muted uppercase">started pts</div>
        </div>
      </div>
      <div className="text-small text-muted mb-2">
        Received {side.totals.assetsReceived} · {side.totals.assetsStillRostered} still rostered ·
        PAR {fmtSigned(side.totals.par)}
      </div>
      <div>
        {side.received.length === 0 ? (
          <p className="text-small text-mutedLow italic py-2">Nothing recorded on this side.</p>
        ) : (
          side.received.map((a, i) => <AssetRow key={i} a={a} />)
        )}
      </div>
    </div>
  )
}

export default function HubTradeDetail() {
  const { slug } = useHub()
  const { tradeId = '' } = useParams()
  const { data: trade, isLoading, isError } = useQuery({
    queryKey: ['hub', slug, 'trade', tradeId],
    queryFn: () => getTrade(slug, tradeId),
  })

  const back = (
    <Link to={`/l/${slug}/trades`} className="text-gold/70 text-small hover:text-gold transition-colors inline-flex items-center gap-1 mb-5">
      ← All trades
    </Link>
  )

  if (isLoading) return <div>{back}<SkeletonLoader rows={6} /></div>
  if (isError || !trade) return <div>{back}<EmptyState>Trade not found.</EmptyState></div>

  const leaderIdx =
    trade.sides.length === 2 && trade.weeksElapsed > 0 && Math.abs(trade.netStartedDiff) >= 1
      ? trade.netStartedDiff >= 0
        ? 0
        : 1
      : -1

  const when = trade.date
    ? new Date(trade.date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
    : `${trade.season}${trade.week != null ? `, week ${trade.week}` : ''}`

  return (
    <div>
      {back}
      <div className="mb-6">
        <p className="text-label text-muted uppercase tracking-[0.06em] font-semibold mb-1">
          {when}
          {trade.isOffseason && ' · offseason'} · {trade.teamCount}-team trade
        </p>
        <h1 className="font-sans text-h1 font-bold text-text">{trade.headline}</h1>
        {trade.weeksElapsed > 0 && (
          <p className="text-small text-mutedLow mt-1">
            Measured over {trade.weeksElapsed} roster week{trade.weeksElapsed === 1 ? '' : 's'} since
            the deal. &ldquo;Started pts&rdquo; counts only weeks an asset was in the lineup; PAR is
            versus a replacement-level starter.
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {trade.sides.map((s, i) => (
          <Side key={s.userId} side={s} leading={i === leaderIdx} />
        ))}
      </div>
    </div>
  )
}
