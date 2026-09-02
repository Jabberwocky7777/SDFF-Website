import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { getSession, login as apiLogin, logout as apiLogout } from '@/api/hub'

interface AuthContextValue {
  authed: boolean
  checking: boolean
  /** League slugs this session may view. */
  slugs: string[]
  admin: boolean
  /** Enter an access code. Returns true on success. */
  login: (code: string) => Promise<boolean>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

/** SDFF is the flagship league with the full site; other codes land in the hub. */
export function useHasFullSite(): boolean {
  const { admin, slugs } = useAuth()
  return admin || slugs.includes('sdff')
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(false)
  const [slugs, setSlugs] = useState<string[]>([])
  const [admin, setAdmin] = useState(false)
  const [checking, setChecking] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const s = await getSession()
      setAuthed(s.authed)
      setSlugs(s.slugs ?? [])
      setAdmin(!!s.admin)
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

  const login = useCallback(async (code: string): Promise<boolean> => {
    try {
      const s = await apiLogin(code)
      if (!s.authed) return false
      setAuthed(true)
      setSlugs(s.slugs ?? [])
      setAdmin(!!s.admin)
      return true
    } catch {
      return false
    }
  }, [])

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
    <AuthContext.Provider value={{ authed, checking, slugs, admin, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
