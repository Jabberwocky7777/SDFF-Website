import { createContext, useContext, type ReactNode } from 'react'

/**
 * Makes the active `:slug` available to data hooks nested deep inside a
 * league route (`/l/:slug/*`) without threading it through every component.
 * `HubLayout` provides it around its `<Outlet>`.
 */
const LeagueSlugContext = createContext<string | null>(null)

export function LeagueScope({ slug, children }: { slug: string; children: ReactNode }) {
  return <LeagueSlugContext.Provider value={slug}>{children}</LeagueSlugContext.Provider>
}

export function useLeagueSlug(): string {
  const slug = useContext(LeagueSlugContext)
  if (!slug) {
    throw new Error('useLeagueSlug must be used within a LeagueScope (a /l/:slug route)')
  }
  return slug
}
