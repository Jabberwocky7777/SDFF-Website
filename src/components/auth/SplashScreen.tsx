import { FormEvent, useState } from 'react'
import { useAuth } from '@/context/AuthContext'

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
          <img src="/logo.svg" alt="SDFF" className="h-16 w-16 opacity-90 mb-6" />
          <h1 className="font-sans text-h1 font-bold text-text tracking-tight mb-1">
            Squad Dynasty FF
          </h1>
          <p className="text-small text-muted">Members only</p>
        </div>

        {/* Password card */}
        <div className="bg-surface border border-borderLow rounded-lg p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-label text-muted uppercase font-sans mb-2">
                League Password
              </label>
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'}
                  value={value}
                  onChange={(e) => { setValue(e.target.value); setError(false) }}
                  placeholder="Enter password"
                  autoFocus
                  className={`w-full bg-background border rounded-lg px-3 py-2.5 pr-10 font-sans text-base text-text placeholder-muted/50 outline-none transition-colors ${
                    error
                      ? 'border-red-500/60 focus:border-red-400'
                      : 'border-borderLow focus:border-border'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-text transition-colors"
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
                <p className="mt-1.5 text-red-400 text-small font-sans">Incorrect password. Try again.</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !value.trim()}
              className="w-full bg-gold text-background font-sans font-semibold text-base py-2.5 rounded-lg transition-opacity disabled:opacity-40 hover:opacity-90"
            >
              {loading ? 'Checking…' : 'Enter'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
