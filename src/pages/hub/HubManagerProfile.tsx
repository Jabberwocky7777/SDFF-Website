import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useHub } from '@/components/hub/HubLayout'
import { getAllPlay, getManagerProfile } from '@/api/hub'
import SkeletonLoader from '@/components/ui/SkeletonLoader'
import { Panel, Stat, fmtRecord, fmtSigned, ordinal } from './shared'

export default function HubManagerProfile() {
  const { slug } = useHub()
  const { userId = '' } = useParams()

  const profile = useQuery({
    queryKey: ['hub', slug, 'manager', userId],
    queryFn: () => getManagerProfile(slug, userId),
  })
  const allplay = useQuery({
    queryKey: ['hub', slug, 'allplay', 'all'],
    queryFn: () => getAllPlay(slug),
  })

  if (profile.isLoading) return <SkeletonLoader rows={8} />
  if (profile.isError || !profile.data) {
    return (
      <div className="bg-surface border border-borderLow rounded-lg p-8 text-center text-muted">
        No profile for this manager.{' '}
        <Link to={`/l/${slug}/managers`} className="text-gold">Back to managers</Link>
      </div>
    )
  }

  const { career, perSeason, nemesis, favorite } = profile.data
  const luck = (allplay.data ?? []).find((r) => r.userId === userId)

  return (
    <div className="space-y-8">
      <div>
        <Link to={`/l/${slug}/managers`} className="text-small text-muted hover:text-gold transition-colors">
          ← All managers
        </Link>
        <h2 className="font-sans text-hero font-bold text-text mt-2">{career.name}</h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Record" value={fmtRecord(career.wins, career.losses, career.ties)} sub={`${(career.winPct * 100).toFixed(1)}% · ${career.seasons} seasons`} />
        <Stat label="Points / game" value={career.ppg.toFixed(1)} />
        <Stat label="Titles" value={career.championships} sub={career.runnerUps ? `${career.runnerUps} runner-up` : undefined} />
        <Stat
          label="Best finish"
          value={career.bestFinish ? ordinal(career.bestFinish) : '—'}
          sub={career.lastPlaceFinishes ? `${career.lastPlaceFinishes}× last` : undefined}
        />
      </div>

      {luck && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="All-play win%" value={`${(luck.allPlayWinPct * 100).toFixed(1)}%`} />
          <Stat label="Expected wins" value={luck.expectedWins.toFixed(1)} sub={`${luck.actualWins} actual`} />
          <Stat
            label="Schedule luck"
            value={<span className={luck.scheduleLuck > 1 ? 'text-green-400' : luck.scheduleLuck < -1 ? 'text-red-400' : ''}>{fmtSigned(luck.scheduleLuck)}</span>}
            sub="wins vs expected"
          />
          <Stat label="Pts vs median" value={fmtSigned(luck.pointsAboveMedian, 0)} />
        </div>
      )}

      {(nemesis || favorite) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {nemesis && (
            <div className="bg-surface border border-borderLow rounded-lg p-4">
              <div className="text-label text-red-400/90 uppercase tracking-[0.05em] font-semibold mb-1">Nemesis</div>
              <Link to={`/l/${slug}/head-to-head/${userId}/vs/${nemesis.userId}`} className="text-h3 font-bold text-text hover:text-gold transition-colors">
                {nemesis.name}
              </Link>
              <div className="text-small text-muted mt-1">
                {nemesis.wins}-{nemesis.losses}{nemesis.ties ? `-${nemesis.ties}` : ''} in {nemesis.meetings} meetings
              </div>
            </div>
          )}
          {favorite && (
            <div className="bg-surface border border-borderLow rounded-lg p-4">
              <div className="text-label text-green-400/90 uppercase tracking-[0.05em] font-semibold mb-1">Favorite matchup</div>
              <Link to={`/l/${slug}/head-to-head/${userId}/vs/${favorite.userId}`} className="text-h3 font-bold text-text hover:text-gold transition-colors">
                {favorite.name}
              </Link>
              <div className="text-small text-muted mt-1">
                {favorite.wins}-{favorite.losses}{favorite.ties ? `-${favorite.ties}` : ''} in {favorite.meetings} meetings
              </div>
            </div>
          )}
        </div>
      )}

      {perSeason.length > 0 && (
        <Panel title="Season by season">
          <div className="divide-y divide-borderLow">
            {perSeason.map(({ season, row }) => (
              <div key={season} className="flex items-center gap-4 px-5 py-3">
                <span className="font-mono text-num text-muted w-14 tabular">{season}</span>
                <span className="font-mono text-num tabular text-text flex-1">
                  {fmtRecord(row.wins, row.losses, row.ties)}
                </span>
                <span className="font-mono text-num tabular text-muted">{row.ppg.toFixed(1)} ppg</span>
                <span className="font-mono text-num tabular text-gold w-14 text-right">
                  {row.bestFinish ? ordinal(row.bestFinish) : ''}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}
