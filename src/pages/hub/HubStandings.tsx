import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useHub } from '@/components/hub/HubLayout'
import { getStandings } from '@/api/hub'
import SkeletonLoader from '@/components/ui/SkeletonLoader'
import { EmptyState } from './shared'
import ScrollTable from './ScrollTable'
import SeasonPills from './SeasonPills'
import { fmtRecord } from '@/lib/formatters'

export default function HubStandings() {
  const { slug, meta } = useHub()
  const [season, setSeason] = useState<number | 'all'>('all')

  const { data, isLoading } = useQuery({
    queryKey: ['hub', slug, 'standings', season],
    queryFn: () => getStandings(slug, season === 'all' ? undefined : season),
  })

  const allTime = season === 'all'

  return (
    <div>
      <SeasonPills
        seasons={meta.seasons.map((s) => s.season)}
        value={season}
        onChange={setSeason}
        allTimeLabel="All-time"
        className="mb-6"
      />

      {isLoading ? (
        <SkeletonLoader rows={10} />
      ) : !data || data.length === 0 ? (
        <EmptyState>No games recorded yet for this {allTime ? 'league' : 'season'}.</EmptyState>
      ) : (
        <ScrollTable>
          <table className="w-full min-w-[640px]">
              <thead>
                <tr className="bg-surfaceHi border-b border-borderLow text-label text-muted uppercase tracking-[0.04em]">
                  <th className="text-left font-semibold px-4 py-3 w-8">#</th>
                  <th className="text-left font-semibold px-2 py-3">Manager</th>
                  <th className="text-center font-semibold px-2 py-3">Record</th>
                  <th className="text-center font-semibold px-2 py-3">Win%</th>
                  <th className="text-center font-semibold px-2 py-3">PF</th>
                  <th className="text-center font-semibold px-2 py-3">PPG</th>
                  {allTime && <th className="text-center font-semibold px-2 py-3">Seasons</th>}
                  {allTime && <th className="text-center font-semibold px-2 py-3">🏆</th>}
                  {allTime && <th className="text-center font-semibold px-4 py-3">Playoffs</th>}
                </tr>
              </thead>
              <tbody>
                {data.map((r, i) => (
                  <tr key={r.userId} className="border-b border-borderLow last:border-0 hover:bg-white/3 transition-colors">
                    <td className="px-4 py-3 font-mono text-num text-mutedLow">{i + 1}</td>
                    <td className="px-2 py-3">
                      <Link to={`/l/${slug}/managers/${r.userId}`} className="font-sans text-base font-semibold text-text hover:text-gold transition-colors">
                        {r.name}
                      </Link>
                    </td>
                    <td className="px-2 py-3 text-center font-mono text-num tabular text-text">
                      {fmtRecord(r.wins, r.losses, r.ties)}
                    </td>
                    <td className="px-2 py-3 text-center font-mono text-num tabular text-muted">
                      {(r.winPct * 100).toFixed(1)}
                    </td>
                    <td className="px-2 py-3 text-center font-mono text-num tabular text-text">
                      {r.pointsFor.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-2 py-3 text-center font-mono text-num tabular text-gold">
                      {r.ppg.toFixed(1)}
                    </td>
                    {allTime && <td className="px-2 py-3 text-center font-mono text-num text-muted">{r.seasons}</td>}
                    {allTime && (
                      <td className="px-2 py-3 text-center font-mono text-num text-gold">
                        {r.championships || <span className="text-mutedLow">—</span>}
                      </td>
                    )}
                    {allTime && (
                      <td className="px-4 py-3 text-center font-mono text-num text-muted">{r.playoffAppearances}</td>
                    )}
                  </tr>
                ))}
              </tbody>
          </table>
        </ScrollTable>
      )}
    </div>
  )
}
