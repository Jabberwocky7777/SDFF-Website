import { useEffect } from 'react'
import { Navigate, Outlet, useLocation, useOutletContext, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getLeagueMeta, type LeagueMeta } from '@/api/hub'
import { useLeagues } from '@/context/LeaguesContext'
import { useAuth } from '@/context/AuthContext'
import { LeagueScope } from '@/context/LeagueScope'
import LeagueSwitcher from './LeagueSwitcher'
import SkeletonLoader from '@/components/ui/SkeletonLoader'
import ErrorBoundary from '@/components/ErrorBoundary'
import { FreshnessNote } from './FreshnessNote'
import HubTabs, { type Tab } from './HubTabs'

export interface HubContext {
  slug: string
  meta: LeagueMeta
}

export function useHub(): HubContext {
  return useOutletContext<HubContext>()
}

/** Sub-nav is capability-aware: everyone gets the analytics + roster/draft tabs;
 *  dynasty leagues additionally get the SDFF content tabs. */
function tabsFor(meta: LeagueMeta): Tab[] {
  const tabs: Tab[] = [
    { to: '', label: 'Overview', end: true },
    { to: 'standings', label: 'Standings' },
    { to: 'history', label: 'History' },
    { to: 'head-to-head', label: 'Head-to-Head' },
    { to: 'records', label: 'Records' },
    { to: 'power-rankings', label: 'Power' },
    { to: 'managers', label: 'Managers' },
    { to: 'trades', label: 'Trades' },
    { to: 'rosters', label: 'Rosters' },
    { to: 'draft', label: 'Draft' },
  ]
  if (meta.type === 'dynasty') {
    tabs.push(
      { to: 'picks', label: 'Rookie Picks' },
      { to: 'dues', label: 'Dues' },
      { to: 'bylaws', label: 'Bylaws' },
      { to: 'timeline', label: 'Calendar' },
      { to: 'news', label: 'News' },
    )
  }
  return tabs
}

export default function HubLayout() {
  const { slug = '' } = useParams()
  const location = useLocation()
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

  const tabs = tabsFor(meta)

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

      <HubTabs tabs={tabs} slug={slug} />

      <LeagueScope slug={slug}>
        <ErrorBoundary resetKey={location.pathname}>
          <Outlet context={{ slug, meta } satisfies HubContext} />
        </ErrorBoundary>
      </LeagueScope>

      <FreshnessNote meta={meta} />
    </div>
  )
}
