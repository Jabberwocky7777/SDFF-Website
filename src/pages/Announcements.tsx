import { Link } from 'react-router-dom'
import { useAnnouncements } from '@/hooks/useAnnouncements'
import SkeletonLoader from '@/components/ui/SkeletonLoader'
import GoldRule from '@/components/ui/GoldRule'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
}

export default function Announcements() {
  const { data: announcements, isLoading } = useAnnouncements()

  return (
    <div>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-serif text-[#F6F0E2] text-2xl font-bold mb-1">Announcements</h1>
          <p className="text-muted text-sm font-sans">League news and updates from the commissioner.</p>
        </div>
        <Link
          to="/admin"
          className="text-muted hover:text-gold text-[10px] font-mono uppercase tracking-widest transition-colors"
        >
          Admin →
        </Link>
      </div>

      {isLoading && <SkeletonLoader rows={4} />}

      {!isLoading && (!announcements || announcements.length === 0) && (
        <div className="bg-surface border border-gold/15 rounded p-8 text-center">
          <p className="text-muted text-sm font-sans">No announcements yet. Check back soon.</p>
        </div>
      )}

      {announcements && announcements.length > 0 && (
        <div className="space-y-4">
          {announcements.map((a) => (
            <article
              key={a.id}
              className={`relative bg-surface border rounded p-5 ${
                a.pinned ? 'border-gold/40 shadow-[0_0_20px_rgba(196,149,42,0.06)]' : 'border-gold/15'
              }`}
            >
              {a.pinned && (
                <span className="inline-flex items-center gap-1 text-[9px] font-sans uppercase tracking-wider text-gold border border-gold/30 px-1.5 py-0.5 rounded mb-3">
                  📌 Pinned
                </span>
              )}
              <h2 className="font-serif text-[#F6F0E2] text-lg font-semibold mb-1">{a.title}</h2>
              <p className="text-muted text-[10px] font-mono uppercase tracking-widest mb-3">
                {formatDate(a.createdAt)}
              </p>
              <GoldRule className="mb-3" />
              <p className="text-[#F6F0E2] text-sm font-sans leading-relaxed whitespace-pre-wrap">{a.body}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
