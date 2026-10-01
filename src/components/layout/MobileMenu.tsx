import { useEffect } from 'react'
import { Link, NavLink } from 'react-router-dom'
import type { HubLeague } from '@/api/hub'

interface Props {
  links: { to: string; label: string }[]
  leagues: HubLeague[]
  open: boolean
  onClose: () => void
  onSignOut: () => void
}

/**
 * Full-screen menu for narrow screens. Opaque on purpose: anything see-through
 * lets the page's own text show between the menu items.
 */
export default function MobileMenu({ links, leagues, open, onClose, onSignOut }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    // Keep the page underneath from scrolling while the menu is up.
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  const item = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-3.5 rounded-lg text-h3 font-medium transition-colors ${
      isActive ? 'text-gold bg-goldLow' : 'text-text hover:bg-white/5'
    }`

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      className="fixed inset-0 z-[60] bg-background flex flex-col"
    >
      {/* Mirrors the nav bar so the close button sits where the hamburger was. */}
      <div className="h-[72px] shrink-0 flex items-center justify-between px-4 border-b border-borderLow">
        <Link to="/" onClick={onClose} className="flex items-center gap-3">
          <img src="/logo.svg" alt="" className="h-9 w-9" />
          <div>
            <div className="font-sans text-text font-bold text-h3 tracking-tight leading-none">Squad Fantasy</div>
            <div className="text-small text-muted mt-0.5">Hub</div>
          </div>
        </Link>
        <button
          onClick={onClose}
          className="text-muted hover:text-gold p-2.5 -mr-1 transition-colors"
          aria-label="Close menu"
        >
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="4" y1="4" x2="16" y2="16" />
            <line x1="16" y1="4" x2="4" y2="16" />
          </svg>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
        {leagues.length > 0 && (
          <div>
            <div className="px-4 mb-2 text-label text-mutedLow uppercase tracking-[0.06em] font-semibold">
              Leagues
            </div>
            <div className="space-y-1">
              {leagues.map((l) => (
                <NavLink key={l.slug} to={`/l/${l.slug}`} onClick={onClose} className={item}>
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: l.theme?.accent ?? '#E0B544' }}
                  />
                  <span className="truncate">{l.displayName}</span>
                  <span className="ml-auto text-label text-mutedLow capitalize">{l.type}</span>
                </NavLink>
              ))}
            </div>
          </div>
        )}

        {links.length > 0 && (
          <div className="space-y-1 pt-5 border-t border-borderLow">
            {links.map(({ to, label }) => (
              <NavLink key={to} to={to} end={to === '/l'} onClick={onClose} className={item}>
                {label}
              </NavLink>
            ))}
          </div>
        )}
      </nav>

      <div className="shrink-0 px-4 py-4 border-t border-borderLow pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          onClick={() => {
            onClose()
            onSignOut()
          }}
          className="w-full px-4 py-3 rounded-lg text-base font-medium text-muted border border-borderLow hover:text-gold transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
