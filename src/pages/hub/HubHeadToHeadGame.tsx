import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useHub } from '@/components/hub/HubLayout'
import { getH2HGameLog, type H2HWLT } from '@/api/hub'
import SkeletonLoader from '@/components/ui/SkeletonLoader'

function fmtWlt(r: H2HWLT): string {
  return `${r.wins}–${r.losses}${r.ties ? `–${r.ties}` : ''}`
}

export default function HubHeadToHeadGame() {
  const { slug } = useHub()
  const { userA = '', userB = '' } = useParams()

  const { data, isLoading } = useQuery({
    queryKey: ['hub', slug, 'h2h', userA, userB],
    queryFn: () => getH2HGameLog(slug, userA, userB),
  })

  return (
    <div>
      <Link
        to={`/l/${slug}/head-to-head`}
        className="inline-flex items-center gap-1 text-small text-muted hover:text-gold transition-colors mb-5"
      >
        ← Head-to-head matrix
      </Link>

      {isLoading || !data ? (
        <SkeletonLoader rows={6} />
      ) : (
        <>
          <div className="bg-surface border border-borderLow rounded-lg p-5 mb-5">
            <div className="flex items-center justify-between">
              <div className="text-right flex-1 min-w-0">
                <div className="font-sans text-h3 font-bold text-text truncate">{data.aName}</div>
              </div>
              <div className="px-4 sm:px-6 shrink-0 text-center">
                <div className="font-mono text-numLg font-bold text-gold tabular">
                  {fmtWlt(data.record.combined)}
                </div>
                <div className="text-label text-mutedLow uppercase">all-time</div>
              </div>
              <div className="text-left flex-1 min-w-0">
                <div className="font-sans text-h3 font-bold text-muted truncate">{data.bName}</div>
              </div>
            </div>

            <div className="flex justify-center gap-6 mt-4 pt-4 border-t border-borderLow">
              <div className="text-center">
                <div className="font-mono text-num tabular text-text">{fmtWlt(data.record.regular)}</div>
                <div className="text-label text-mutedLow uppercase">regular season</div>
              </div>
              <div className="text-center">
                <div className="font-mono text-num tabular text-text">{fmtWlt(data.record.playoff)}</div>
                <div className="text-label text-mutedLow uppercase">playoffs</div>
              </div>
            </div>
          </div>

          {data.games.length === 0 ? (
            <div className="bg-surface border border-borderLow rounded-lg p-8 text-center text-muted">
              These two haven't played yet.
            </div>
          ) : (
            <div className="bg-surface border border-borderLow rounded-lg divide-y divide-borderLow">
              {data.games.map((g, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3">
                  <span className="font-mono text-num text-mutedLow w-20 shrink-0">
                    {g.season} · w{g.week}
                  </span>
                  <span
                    className={`w-6 h-6 rounded flex items-center justify-center text-label font-bold shrink-0 ${
                      g.result === 'W'
                        ? 'bg-green-500/20 text-green-400'
                        : g.result === 'L'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-white/10 text-muted'
                    }`}
                  >
                    {g.result}
                  </span>
                  <span className="font-mono text-num tabular text-text flex-1">
                    {g.points.toFixed(2)} – {g.opponentPoints.toFixed(2)}
                  </span>
                  <span className={`font-mono text-num tabular shrink-0 ${g.margin > 0 ? 'text-green-400/70' : 'text-red-400/70'}`}>
                    {g.margin > 0 ? '+' : ''}{g.margin.toFixed(2)}
                  </span>
                  {g.isPlayoff && (
                    <span className="text-label text-gold/70 uppercase shrink-0 hidden sm:inline">
                      playoff
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
