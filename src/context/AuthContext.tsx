import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  getSession,
  login as apiLogin,
  logout as apiLogout,
  runSetup as apiSetup,
} from '@/api/hub'

interface AuthContextValue {
  authed: boolean
  checking: boolean
  /** No admin password set yet — show the first-run setup screen. */
  needsSetup: boolean
  hasLeagues: boolean
  flagshipSlug: string | null
  /** League slugs this session may view. */
  slugs: string[]
  admin: boolean
  login: (code: string) => Promise<boolean>
  logout: () => Promise<void>
  setup: (password: string) => Promise<string | null>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

/** The flagship (first) league has the full dynasty site; other codes land in the hub. */
export function useHasFullSite(): boolean {
  const { admin, slugs, flagshipSlug } = useAuth()
  return admin || (!!flagshipSlug && slugs.includes(flagshipSlug))
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(false)
  const [slugs, setSlugs] = useState<string[]>([])
  const [admin, setAdmin] = useState(false)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [hasLeagues, setHasLeagues] = useState(false)
  const [flagshipSlug, setFlagshipSlug] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const s = await getSession()
      setAuthed(s.authed)
      setSlugs(s.slugs ?? [])
      setAdmin(!!s.admin)
      setNeedsSetup(!!s.needsSetup)
      setHasLeagues(!!s.hasLeagues)
      setFlagshipSlug(s.flagshipSlug ?? null)
    } catch {
      setAuthed(false)
      setSlugs([])
      setAdmin(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    refresh().then(() => {
      if (active) setChecking(false)
    })
    return () => {
      active = false
    }
  }, [refresh])

  useEffect(() => {
    const handler = () => {
      setAuthed(false)
      setSlugs([])
      setAdmin(false)
    }
    window.addEventListener('sdff:auth-failure', handler)
    return () => window.removeEventListener('sdff:auth-failure', handler)
  }, [])

  const login = useCallback(
    async (code: string): Promise<boolean> => {
      try {
        const s = await apiLogin(code)
        if (!s.authed) return false
        await refresh()
        return true
      } catch {
        return false
      }
    },
    [refresh],
  )

  const setup = useCallback(
    async (password: string): Promise<string | null> => {
      try {
        await apiSetup(password)
        await refresh()
        return null
      } catch (err) {
        return err instanceof Error && 'status' in err ? 'Setup failed. Try again.' : 'Setup failed.'
      }
    },
    [refresh],
  )

  const logout = useCallback(async () => {
    try {
      await apiLogout()
    } finally {
      setAuthed(false)
      setSlugs([])
      setAdmin(false)
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        authed,
        checking,
        needsSetup,
        hasLeagues,
        flagshipSlug,
        slugs,
        admin,
        login,
        logout,
        setup,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
