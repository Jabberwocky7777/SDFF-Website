import { createContext, useCallback, useContext, useEffect, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getSession,
  login as apiLogin,
  logout as apiLogout,
  runSetup as apiSetup,
  type SessionInfo,
} from '@/api/hub'

interface AuthContextValue {
  authed: boolean
  checking: boolean
  /** No admin password set yet — show the first-run setup screen. */
  needsSetup: boolean
  hasLeagues: boolean
  flagshipSlug: string | null
  /** true = the server's storage volume failed; data resets on restart. */
  ephemeralStorage: boolean
  /** League slugs this session may view. */
  slugs: string[]
  admin: boolean
  /** Returns an error message, or null on success. */
  login: (code: string) => Promise<string | null>
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

const SESSION_KEY = ['auth', 'session'] as const

/** What the app assumes before the first /auth/session response lands. */
const LOGGED_OUT: SessionInfo = {
  authed: false,
  slugs: [],
  admin: false,
  needsSetup: false,
  hasLeagues: false,
  flagshipSlug: null,
  ephemeralStorage: false,
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  // The session is server state like everything else in the app, so it lives in
  // the query cache rather than in eight useStates kept in sync by hand.
  const { data, isPending } = useQuery({
    queryKey: SESSION_KEY,
    queryFn: getSession,
    retry: false,
    staleTime: Infinity,
  })

  const session = data ?? LOGGED_OUT

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: SESSION_KEY })
  }, [queryClient])

  // A 401 on any request means the cookie died mid-session; drop to logged-out
  // without a round trip. Subscribing to an external event and writing in the
  // callback is the pattern effects are for.
  useEffect(() => {
    const handler = () => {
      queryClient.setQueryData<SessionInfo>(SESSION_KEY, (prev) => ({
        ...(prev ?? LOGGED_OUT),
        authed: false,
        slugs: [],
        admin: false,
      }))
    }
    window.addEventListener('sdff:auth-failure', handler)
    return () => window.removeEventListener('sdff:auth-failure', handler)
  }, [queryClient])

  const login = useCallback(
    async (code: string): Promise<string | null> => {
      try {
        const s = await apiLogin(code)
        if (!s.authed) return 'Login failed.'
        await refresh()
        return null
      } catch (err) {
        return err instanceof Error && err.message ? err.message : 'Login failed.'
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
      // Keep needsSetup/hasLeagues — they describe the install, not the session.
      queryClient.setQueryData<SessionInfo>(SESSION_KEY, (prev) => ({
        ...(prev ?? LOGGED_OUT),
        authed: false,
        slugs: [],
        admin: false,
      }))
    }
  }, [queryClient])

  return (
    <AuthContext.Provider
      value={{
        authed: session.authed,
        checking: isPending,
        needsSetup: session.needsSetup,
        hasLeagues: session.hasLeagues,
        flagshipSlug: session.flagshipSlug,
        ephemeralStorage: session.ephemeralStorage,
        slugs: session.slugs,
        admin: session.admin,
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
