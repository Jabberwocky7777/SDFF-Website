import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { AUTH_KEY } from '@/api/client'
import { API_BASE } from '@/config'

interface AuthContextValue {
  authed: boolean
  checking: boolean
  setPassword: (pwd: string) => Promise<boolean>
  clearPassword: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

async function validatePassword(pwd: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/me`, {
      headers: { Authorization: 'Basic ' + btoa(`sdff:${pwd}`) },
    })
    return res.ok
  } catch {
    return false
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(false)
  const [checking, setChecking] = useState(true)

  // On mount: validate stored password
  useEffect(() => {
    const stored = sessionStorage.getItem(AUTH_KEY)
    if (!stored) {
      setChecking(false)
      return
    }
    validatePassword(stored).then((ok) => {
      setAuthed(ok)
      if (!ok) sessionStorage.removeItem(AUTH_KEY)
      setChecking(false)
    })
  }, [])

  // Listen for auth failures from apiFetch
  useEffect(() => {
    const handler = () => {
      sessionStorage.removeItem(AUTH_KEY)
      setAuthed(false)
    }
    window.addEventListener('sdff:auth-failure', handler)
    return () => window.removeEventListener('sdff:auth-failure', handler)
  }, [])

  const setPassword = useCallback(async (pwd: string): Promise<boolean> => {
    const ok = await validatePassword(pwd)
    if (ok) {
      sessionStorage.setItem(AUTH_KEY, pwd)
      setAuthed(true)
    }
    return ok
  }, [])

  const clearPassword = useCallback(() => {
    sessionStorage.removeItem(AUTH_KEY)
    setAuthed(false)
  }, [])

  return (
    <AuthContext.Provider value={{ authed, checking, setPassword, clearPassword }}>
      {children}
    </AuthContext.Provider>
  )
}
