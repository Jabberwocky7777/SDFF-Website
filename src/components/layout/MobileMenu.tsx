import { NavLink } from 'react-router-dom'

interface Props {
  links: { to: string; label: string }[]
  open: boolean
  onClose: () => void
}

export default function MobileMenu({ links, open, onClose }: Props) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-background/98 flex flex-col" onClick={onClose}>
      <div className="flex justify-end p-4">
        <button className="text-muted hover:text-gold p-2" aria-label="Close menu">
          <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="4" y1="4" x2="18" y2="18" />
            <line x1="18" y1="4" x2="4" y2="18" />
          </svg>
        </button>
      </div>
      <nav className="flex flex-col items-center gap-2 pt-8">
        {links.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={onClose}
            className={({ isActive }) =>
              `w-full max-w-xs text-center py-4 font-sans text-xl border-b border-borderLow transition-colors ${
                isActive ? 'text-gold' : 'text-text hover:text-gold'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
