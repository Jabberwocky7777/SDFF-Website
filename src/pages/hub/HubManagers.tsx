import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useHub } from '@/components/hub/HubLayout'
import { getAllPlay, getManagers } from '@/api/hub'
import SkeletonLoader from '@/components/ui/SkeletonLoader'
import { EmptyState, fmtRecord, fmtSigned } from './shared'

export default function HubManagers() {
  const { slug } = useHub()
  const managers = useQuery({ queryKey: ['hub', slug, 'managers'], queryFn: () => getManagers(slug) })
  const allplay = useQuery({ queryKey: ['hub', slug, 'allplay', 'all'], queryFn: () => getAllPlay(slug) })

  if (managers.isLoading) return <SkeletonLoader rows={10} />
  if (!managers.data || managers.data.length === 0) {
    return <EmptyState>No manager history yet.</EmptyState>
  }

  const luckBy = new Map((allplay.data ?? []).map((r) => [r.userId, r]))

  return (
    <div className="bg-surface border border-borderLow rounded-lg divide-y divide-borderLow">
      {managers.data.map((m) => {
        const luck = luckBy.get(m.userId)
        return (
          <Link
            key={m.userId}
            to={`/l/${slug}/managers/${m.userId}`}
            className="flex items-center gap-4 px-5 py-4 hover:bg-white/3 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="font-sans text-h3 font-semibold text-text truncate">{m.name}</div>
              <div className="text-small text-muted mt-0.5">
                {m.seasons} season{m.seasons === 1 ? '' : 's'} · {fmtRecord(m.wins, m.losses, m.ties)} ·{' '}
                {m.ppg.toFixed(1)} ppg
                {m.championships > 0 && <span className="text-gold"> · {m.championships}× champ</span>}
              </div>
            </div>
            {luck && (
              <div className="text-right shrink-0 hidden sm:block">
                <div
                  className={`font-mono text-num tabular font-semibold ${
                    luck.scheduleLuck > 1 ? 'text-green-400' : luck.scheduleLuck < -1 ? 'text-red-400' : 'text-muted'
                  }`}
                >
                  {fmtSigned(luck.scheduleLuck)}
                </div>
                <div className="text-label text-mutedLow uppercase">luck</div>
              </div>
            )}
            <div className="text-right shrink-0">
              <div className="font-mono text-num tabular text-gold font-bold">
                {(m.winPct * 100).toFixed(0)}%
              </div>
              <div className="text-label text-mutedLow uppercase">win</div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
