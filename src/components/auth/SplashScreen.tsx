import { FormEvent, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import DotDivider from '@/components/ui/DotDivider'

export default function SplashScreen() {
  const { setPassword } = useAuth()
  const [value, setValue] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!value.trim()) return
    setLoading(true)
    setError(false)
    const ok = await setPassword(value.trim())
    if (!ok) {
      setError(true)
      setValue('')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* Logo + branding */}
        <div className="flex flex-col items-center mb-10">
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-32 h-32 rounded-full bg-gold/8 blur-2xl" />
            </div>
            <img src="/logo.svg" alt="SDFF" className="relative h-16 w-16 opacity-90" />
          </div>
          <h1 className="font-serif text-[#F6F0E2] text-2xl font-bold tracking-wide mb-1">
            Squad Dynasty FF
          </h1>
          <p className="text-muted text-xs font-sans uppercase tracking-[0.25em]">
            Members only
          </p>
        </div>

        {/* Password card */}
        <div className="relative bg-surface border border-gold/20 rounded p-6">
          <span className="absolute top-2 left-3 text-gold/25 text-xs font-mono">┌</span>
          <span className="absolute top-2 right-3 text-gold/25 text-xs font-mono">┐</span>
          <span className="absolute bottom-2 left-3 text-gold/25 text-xs font-mono">└</span>
          <span className="absolute bottom-2 right-3 text-gold/25 text-xs font-mono">┘</span>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-muted text-[10px] uppercase tracking-widest font-sans mb-2">
                League Password
              </label>
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'}
                  value={value}
                  onChange={(e) => { setValue(e.target.value); setError(false) }}
                  placeholder="Enter password"
                  autoFocus
                  className={`w-full bg-background border rounded px-3 py-2.5 pr-10 font-mono text-sm text-[#F6F0E2] placeholder-muted/50 outline-none transition-colors ${
                    error
                      ? 'border-red-500/60 focus:border-red-400'
                      : 'border-gold/20 focus:border-gold/50'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-[#F6F0E2] transition-colors"
                  aria-label={show ? 'Hide password' : 'Show password'}
                >
                  {show ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              {error && (
                <p className="mt-1.5 text-red-400 text-xs font-sans">Incorrect password. Try again.</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !value.trim()}
              className="w-full bg-gold text-background font-sans font-semibold text-sm py-2.5 rounded transition-opacity disabled:opacity-40 hover:opacity-90"
            >
              {loading ? 'Checking…' : 'Enter'}
            </button>
          </form>
        </div>

        <DotDivider className="my-8 w-24 mx-auto" />
        <p className="text-center text-muted text-[10px] font-mono uppercase tracking-[0.25em]">
          · · · Est. 2026 · · ·
        </p>
      </div>
    </div>
  )
}
