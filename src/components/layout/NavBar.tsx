import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import MobileMenu from './MobileMenu'
import { useAuth, useHasFullSite } from '@/context/AuthContext'
import { useLeagues } from '@/context/LeaguesContext'

const SDFF_LINKS = [
  { to: '/', label: 'Dashboard' },
  { to: '/standings', label: 'Standings' },
  { to: '/rosters', label: 'Rosters' },
  { to: '/picks', label: 'Picks' },
  { to: '/draft', label: 'Draft' },
  { to: '/draft-grades', label: 'Draft Grades' },
  { to: '/dues', label: 'Dues' },
  { to: '/timeline', label: 'Timeline' },
  { to: '/bylaws', label: 'Bylaws' },
  { to: '/announcements', label: 'News' },
]

export default function NavBar() {
  const [open, setOpen] = useState(false)
  const fullSite = useHasFullSite()
  const { admin, slugs, logout } = useAuth()
  const { leagues } = useLeagues()
  const navigate = useNavigate()

  const hubLeagues = leagues.filter((l) => admin || slugs.includes(l.slug))
  const showHub = hubLeagues.length > 0

  const links = [
    ...(fullSite ? SDFF_LINKS : []),
    ...(showHub ? [{ to: '/l', label: fullSite ? 'Leagues' : 'Home' }] : []),
  ]

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/98 backdrop-blur-sm border-b border-borderLow h-[72px]">
        <div className="max-w-6xl mx-auto px-6 h-full flex items-center justify-between">
          <Link to={fullSite ? '/' : '/l'} className="flex items-center gap-3 shrink-0">
            <img src="/logo.svg" alt="SDFF" className="h-9 w-9" />
            <div>
              <div className="font-sans text-text font-bold text-h3 tracking-tight leading-none">Squad Fantasy</div>
              <div className="text-small text-muted mt-0.5">Hub</div>
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
                  `px-3 py-2 text-small font-medium rounded-md transition-all duration-150 ${
                    isActive ? 'text-gold bg-goldLow' : 'text-text hover:bg-white/5'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
            {showHub && hubLeagues.length > 1 && <NavLeagueMenu />}
            <button
              onClick={() => logout().then(() => navigate('/'))}
              className="ml-1 px-3 py-2 text-small font-medium text-muted hover:text-gold transition-colors"
            >
              Sign out
            </button>
          </div>

          {/* Mobile hamburger */}
          <button
            className="sm:hidden text-muted hover:text-gold p-2.5 -mr-1 transition-colors"
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

      <MobileMenu
        links={[...links, ...hubLeagues.map((l) => ({ to: `/l/${l.slug}`, label: l.displayName }))]}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  )
}

function NavLeagueMenu() {
  const { leagues } = useLeagues()
  const { admin, slugs } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const visible = leagues.filter((l) => admin || slugs.includes(l.slug))

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="px-3 py-2 text-small font-medium text-text hover:bg-white/5 rounded-md transition-colors flex items-center gap-1"
      >
        Switch
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={open ? 'rotate-180' : ''}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 mt-1.5 w-56 bg-surface border border-borderLow rounded-lg py-1 shadow-xl shadow-black/40">
          {visible.map((l) => (
            <button
              key={l.slug}
              onClick={() => {
                setOpen(false)
                navigate(`/l/${l.slug}`)
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-small text-left text-text hover:bg-white/5 transition-colors"
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: l.theme?.accent ?? '#E0B544' }} />
              <span className="truncate">{l.displayName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
