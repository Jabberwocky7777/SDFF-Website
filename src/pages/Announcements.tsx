import { Link } from 'react-router-dom'
import { useAnnouncements } from '@/hooks/useAnnouncements'
import SkeletonLoader from '@/components/ui/SkeletonLoader'
import GoldRule from '@/components/ui/GoldRule'
import { useAuth } from '@/context/AuthContext'
import { useLeagueSlug } from '@/context/LeagueScope'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
}

export default function Announcements() {
  const { data: announcements, isLoading } = useAnnouncements()
  const { admin } = useAuth()
  const slug = useLeagueSlug()

  return (
    <div>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-sans text-h1 font-bold text-text mb-1">Announcements</h1>
          <p className="text-body text-muted">League news and updates from the commissioner.</p>
        </div>
        {admin && (
          <Link
            to={`/l/${slug}/admin`}
            className="text-small font-medium text-muted hover:text-gold transition-colors"
          >
            Admin →
          </Link>
        )}
      </div>

      {isLoading && <SkeletonLoader rows={4} />}

      {!isLoading && (!announcements || announcements.length === 0) && (
        <div className="bg-surface border border-borderLow rounded-lg p-8 text-center">
          <p className="text-base text-muted font-sans">No announcements yet. Check back soon.</p>
        </div>
      )}

      {announcements && announcements.length > 0 && (
        <div className="space-y-4">
          {announcements.map((a) => (
            <article
              key={a.id}
              className={`relative bg-surface border rounded-lg p-5 ${
                a.pinned ? 'border-border shadow-[0_0_20px_rgba(224,181,68,0.06)]' : 'border-borderLow'
              }`}
            >
              {a.pinned && (
                <span className="inline-flex items-center bg-goldLow text-gold text-label font-bold px-2.5 py-1 rounded-full mb-3">
                  Pinned
                </span>
              )}
              <h2 className="font-sans text-h3 font-semibold text-text mb-1">{a.title}</h2>
              <p className="text-small text-mutedLow mb-3">
                {formatDate(a.createdAt)}
              </p>
              <GoldRule className="mb-3" />
              <p className="text-base text-text leading-relaxed whitespace-pre-wrap">{a.body}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
