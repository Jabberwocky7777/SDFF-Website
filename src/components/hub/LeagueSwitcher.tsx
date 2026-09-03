import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useLeagues } from '@/context/LeaguesContext'
import { useAuth } from '@/context/AuthContext'

/**
 * Switches the `:slug` segment while keeping the current sub-route:
 * `/l/sdff/records` -> pick "athens" -> `/l/athens/records`.
 */
export default function LeagueSwitcher({ currentSlug }: { currentSlug: string }) {
  const { leagues } = useLeagues()
  const { slugs, admin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
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
  const current = visible.find((l) => l.slug === currentSlug)
  if (visible.length <= 1) {
    return current ? (
      <span className="text-small text-muted font-medium">{current.displayName}</span>
    ) : null
  }

  const subPath = location.pathname.replace(`/l/${currentSlug}`, '') || ''

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 bg-surface border border-borderLow rounded-lg px-3 py-2 text-small font-semibold text-text hover:border-border transition-colors"
      >
        <span className="w-2 h-2 rounded-full" style={{ background: current?.theme?.accent ?? '#E0B544' }} />
        {current?.displayName ?? 'Select league'}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 z-40 w-56 bg-surface border border-borderLow rounded-lg py-1 shadow-xl shadow-black/40">
          {visible.map((l) => (
            <button
              key={l.slug}
              onClick={() => {
                setOpen(false)
                navigate(`/l/${l.slug}${subPath}`)
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-small text-left transition-colors ${
                l.slug === currentSlug ? 'text-gold' : 'text-text hover:bg-white/5'
              }`}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: l.theme?.accent ?? '#E0B544' }} />
              <span className="truncate">{l.displayName}</span>
              <span className="ml-auto text-label text-mutedLow uppercase">{l.type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
