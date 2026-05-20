import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import MobileMenu from './MobileMenu'

const links = [
  { to: '/', label: 'Dashboard' },
  { to: '/standings', label: 'Standings' },
  { to: '/rosters', label: 'Rosters' },
  { to: '/timeline', label: 'Timeline' },
  { to: '/bylaws', label: 'Bylaws' },
]

export default function NavBar() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/98 backdrop-blur-sm border-b border-gold/20 h-16">
        <div className="max-w-6xl mx-auto px-6 h-full flex items-center justify-between">

          <Link to="/" className="flex items-center gap-3 shrink-0">
            <img src="/logo.svg" alt="SDFF" className="h-9 w-9" />
            <div>
              <div className="font-serif text-[#F6F0E2] font-bold text-sm leading-none tracking-widest uppercase">
                Squad
              </div>
              <div className="font-sans text-gold text-[10px] uppercase tracking-[0.2em] mt-0.5">
                Dynasty
              </div>
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
                  `px-3 py-1.5 text-xs font-sans uppercase tracking-wider rounded transition-all duration-150 ${
                    isActive
                      ? 'text-gold border border-gold/40 bg-gold/8'
                      : 'text-[#52526A] hover:text-[#F6F0E2] hover:bg-white/5'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </div>

          {/* Mobile hamburger */}
          <button
            className="sm:hidden text-[#52526A] hover:text-gold p-2 transition-colors"
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
