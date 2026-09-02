import { Link, Navigate } from 'react-router-dom'
import { useLeagues } from '@/context/LeaguesContext'
import { useAuth } from '@/context/AuthContext'
import SkeletonLoader from '@/components/ui/SkeletonLoader'

export default function HubHome() {
  const { leagues, loading, lastLeague } = useLeagues()
  const { slugs, admin, logout } = useAuth()

  const visible = leagues.filter((l) => admin || slugs.includes(l.slug))

  if (loading) return <SkeletonLoader rows={4} />

  // One league → go straight in. Returning visitor → last league.
  if (visible.length === 1) return <Navigate to={`/l/${visible[0].slug}`} replace />
  if (lastLeague && visible.some((l) => l.slug === lastLeague)) {
    return <Navigate to={`/l/${lastLeague}`} replace />
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-sans text-h1 sm:text-hero font-bold text-text mb-2">Your Leagues</h1>
          <p className="text-body text-muted">Pick a league to explore its history and standings.</p>
        </div>
        <button
          onClick={() => logout()}
          className="text-small text-muted hover:text-gold transition-colors shrink-0"
        >
          Sign out
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="bg-surface border border-borderLow rounded-lg p-10 text-center">
          <p className="text-base text-muted">Your code doesn't unlock any leagues yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {visible.map((l) => (
            <Link
              key={l.slug}
              to={`/l/${l.slug}`}
              className="group bg-surface border border-borderLow rounded-lg p-5 hover:border-border transition-colors"
            >
              <div className="flex items-center gap-3 mb-3">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ background: l.theme?.accent ?? '#E0B544' }}
                />
                <span className="text-label text-muted uppercase tracking-[0.06em] font-semibold">
                  {l.type}
                </span>
              </div>
              <div className="font-sans text-h2 font-bold text-text group-hover:text-gold transition-colors">
                {l.displayName}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
