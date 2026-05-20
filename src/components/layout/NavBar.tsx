import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import MobileMenu from './MobileMenu'

const links = [
  { to: '/', label: 'Dashboard' },
  { to: '/standings', label: 'Standings' },
  { to: '/rosters', label: 'Rosters' },
  { to: '/timeline', label: 'Timeline' },
  { to: '/bylaws', label: 'Bylaws' },
  { to: '/announcements', label: 'News' },
]

export default function NavBar() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/98 backdrop-blur-sm border-b border-borderLow h-[72px]">
        <div className="max-w-6xl mx-auto px-6 h-full flex items-center justify-between">

          <Link to="/" className="flex items-center gap-3 shrink-0">
            <img src="/logo.svg" alt="SDFF" className="h-9 w-9" />
            <div>
              <div className="font-sans text-text font-bold text-h3 tracking-tight leading-none">Squad Dynasty</div>
              <div className="text-small text-muted mt-0.5">Fantasy Football · 2026</div>
            </div>
          </Link>

          {/* Desktop nav */}
          <div className="hidden sm:flex items-center gap-0.5">
            {links.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `px-3.5 py-2 text-small font-medium rounded-md transition-all duration-150 ${
                    isActive
                      ? 'text-gold bg-goldLow'
                      : 'text-text hover:bg-white/5'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </div>

          {/* Mobile hamburger */}
          <button
            className="sm:hidden text-muted hover:text-gold p-2 transition-colors"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="2" y1="5" x2="18" y2="5" />
              <line x1="2" y1="10" x2="18" y2="10" />
              <line x1="2" y1="15" x2="18" y2="15" />
            </svg>
          </button>
        </div>
      </nav>

      <MobileMenu links={links} open={open} onClose={() => setOpen(false)} />
    </>
  )
}
