import { useEffect } from 'react'
import { NavLink, Navigate, Outlet, useOutletContext, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getLeagueMeta, type LeagueMeta } from '@/api/hub'
import { useLeagues } from '@/context/LeaguesContext'
import { useAuth } from '@/context/AuthContext'
import LeagueSwitcher from './LeagueSwitcher'
import SkeletonLoader from '@/components/ui/SkeletonLoader'

export interface HubContext {
  slug: string
  meta: LeagueMeta
}

export function useHub(): HubContext {
  return useOutletContext<HubContext>()
}

const TABS = [
  { to: '', label: 'Overview', end: true },
  { to: 'standings', label: 'Standings' },
  { to: 'history', label: 'History' },
  { to: 'head-to-head', label: 'Head-to-Head' },
  { to: 'records', label: 'Records' },
  { to: 'power-rankings', label: 'Power' },
  { to: 'managers', label: 'Managers' },
]

export default function HubLayout() {
  const { slug = '' } = useParams()
  const { leagues, loading, rememberLeague } = useLeagues()
  const { slugs, admin } = useAuth()

  const known = leagues.some((l) => l.slug === slug)
  const allowed = admin || slugs.includes(slug)

  const { data: meta, isLoading: metaLoading } = useQuery({
    queryKey: ['hub', slug, 'meta'],
    queryFn: () => getLeagueMeta(slug),
    enabled: known && allowed,
  })

  useEffect(() => {
    if (known && allowed) rememberLeague(slug)
  }, [known, allowed, slug, rememberLeague])

  useEffect(() => {
    const accent = meta?.theme?.accent
    const root = document.documentElement
    if (accent) root.style.setProperty('--accent', accent)
    return () => {
      root.style.removeProperty('--accent')
    }
  }, [meta?.theme?.accent])

  if (loading) {
    return <SkeletonLoader rows={4} />
  }
  if (!known || !allowed) {
    return <Navigate to="/" replace />
  }
  if (metaLoading || !meta) {
    return <SkeletonLoader rows={6} />
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <p className="text-label text-muted uppercase tracking-[0.06em] font-semibold mb-1">
            {meta.type} league
          </p>
          <h1 className="font-sans text-h1 sm:text-hero font-bold text-text">{meta.displayName}</h1>
        </div>
        <LeagueSwitcher currentSlug={slug} />
      </div>

      <div className="-mx-6 px-6 mb-8 overflow-x-auto">
        <div className="flex gap-1 bg-surfaceHi border border-borderLow rounded-lg p-1 w-max min-w-full sm:min-w-0 sm:w-fit">
          {TABS.map((t) => (
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

      <Outlet context={{ slug, meta } satisfies HubContext} />
    </div>
  )
}
