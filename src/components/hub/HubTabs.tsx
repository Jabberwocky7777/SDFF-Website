import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'

export interface Tab {
  to: string
  label: string
  end?: boolean
}

/**
 * The league sub-nav.
 *
 * Wide screens wrap the pills onto as many rows as they need, so every tab is
 * visible at once. Narrow screens keep a single scrolling row — but with edge
 * fades and the active pill scrolled into view, so a half-clipped "News" at the
 * right edge reads as "there's more this way" rather than as a broken layout.
 */
export default function HubTabs({ tabs, slug }: { tabs: Tab[]; slug: string }) {
  const scroller = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  const syncEdges = useCallback(() => {
    const el = scroller.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    // A wrapped (non-scrolling) bar has max === 0, which correctly hides both.
    setEdges({ left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 })
  }, [])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    syncEdges()
    el.addEventListener('scroll', syncEdges, { passive: true })
    window.addEventListener('resize', syncEdges)
    return () => {
      el.removeEventListener('scroll', syncEdges)
      window.removeEventListener('resize', syncEdges)
    }
  }, [syncEdges, tabs.length])

  // Landing on a deep link shouldn't leave the current tab off-screen. Set
  // scrollLeft directly rather than scrollIntoView, which would also yank the
  // page vertically.
  useEffect(() => {
    const el = scroller.current
    const active = el?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!el || !active) return
    el.scrollLeft = active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2
  }, [slug])

  return (
    <div className="relative mb-8 -mx-4 sm:-mx-6 lg:-mx-8">
      <div
        ref={scroller}
        className="overflow-x-auto lg:overflow-x-visible scroll-smooth px-4 sm:px-6 lg:px-8"
      >
        <div className="flex gap-1 bg-surfaceHi border border-borderLow rounded-lg p-1 w-max lg:w-auto lg:flex-wrap">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to ? `/l/${slug}/${t.to}` : `/l/${slug}`}
              end={t.end}
              className={({ isActive }) =>
                `px-3.5 py-2 text-small font-semibold rounded-md transition-all whitespace-nowrap ${
                  isActive ? 'bg-gold text-[#1A1100]' : 'text-muted hover:text-text'
                }`
              }
            >
              {t.label}
            </NavLink>
          ))}
        </div>
      </div>

      {/* Scroll affordances — narrow screens only, since lg wraps instead. */}
      <div
        aria-hidden
        className={`lg:hidden pointer-events-none absolute inset-y-0 left-4 sm:left-6 w-10 rounded-l-lg bg-gradient-to-r from-surfaceHi to-transparent transition-opacity ${
          edges.left ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div
        aria-hidden
        className={`lg:hidden pointer-events-none absolute inset-y-0 right-4 sm:right-6 w-10 rounded-r-lg bg-gradient-to-l from-surfaceHi to-transparent transition-opacity ${
          edges.right ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  )
}
