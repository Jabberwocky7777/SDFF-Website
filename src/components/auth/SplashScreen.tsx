import { useState, type FormEvent } from 'react'
import { useAuth } from '@/context/AuthContext'
import PasswordInput from '@/components/ui/PasswordInput'

export default function SplashScreen() {
  const { login } = useAuth()
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!value.trim()) return
    setLoading(true)
    setError('')
    const err = await login(value.trim())
    if (err) {
      setError(err)
      setValue('')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <img src="/logo.svg" alt="SDFF" className="h-16 w-16 opacity-90 mb-6" />
          <h1 className="font-sans text-h1 font-bold text-text tracking-tight mb-1">
            Squad Fantasy Hub
          </h1>
          <p className="text-small text-muted">Enter your league's access code</p>
        </div>

        <div className="bg-surface border border-borderLow rounded-lg p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-label text-muted uppercase font-sans mb-2 tracking-[0.06em]">
                Access Code
              </label>
              <PasswordInput
                value={value}
                onChange={(v) => {
                  setValue(v)
                  setError('')
                }}
                placeholder="e.g. SDFF"
                autoFocus
                invalid={!!error}
                mono
              />
              {error && <p className="mt-1.5 text-red-400 text-small font-sans">{error}</p>}
            </div>

            <button
              type="submit"
              disabled={loading || !value.trim()}
              className="w-full bg-gold text-background font-sans font-semibold text-base py-2.5 rounded-lg transition-opacity disabled:opacity-40 hover:opacity-90"
            >
              {loading ? 'Checking…' : 'Enter'}
            </button>
          </form>

          <p className="mt-4 text-small text-mutedLow leading-relaxed">
            Each league has its own code. Commissioners: use your admin password here.
          </p>
        </div>
      </div>
    </div>
  )
}
