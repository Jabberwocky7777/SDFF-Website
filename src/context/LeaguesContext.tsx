import { createContext, useContext, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getLeagues, type HubLeague } from '@/api/hub'
import { useAuth } from './AuthContext'

const LAST_LEAGUE_KEY = 'sdff_last_league'

interface LeaguesContextValue {
  leagues: HubLeague[]
  loading: boolean
  lastLeague: string | null
  rememberLeague: (slug: string) => void
}

const LeaguesContext = createContext<LeaguesContextValue | null>(null)

export function useLeagues(): LeaguesContextValue {
  const ctx = useContext(LeaguesContext)
  if (!ctx) throw new Error('useLeagues must be used within LeaguesProvider')
  return ctx
}

export function LeaguesProvider({ children }: { children: ReactNode }) {
  const { authed } = useAuth()
  const { data, isLoading } = useQuery({
    queryKey: ['hub', 'leagues'],
    queryFn: getLeagues,
    staleTime: 5 * 60 * 1000,
    enabled: authed,
  })

  const leagues = (data ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder)

  const value: LeaguesContextValue = {
    leagues,
    loading: isLoading,
    lastLeague: localStorage.getItem(LAST_LEAGUE_KEY),
    rememberLeague: (slug: string) => localStorage.setItem(LAST_LEAGUE_KEY, slug),
  }

  return <LeaguesContext.Provider value={value}>{children}</LeaguesContext.Provider>
}
