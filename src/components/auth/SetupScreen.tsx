import { useState, type FormEvent } from 'react'
import { useAuth } from '@/context/AuthContext'
import PasswordInput from '@/components/ui/PasswordInput'

export default function SetupScreen() {
  const { setup } = useAuth()
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pw.length < 6) return setError('Use at least 6 characters.')
    if (pw !== confirm) return setError('Passwords don’t match.')
    setLoading(true)
    setError('')
    const err = await setup(pw)
    if (err) {
      setError(err)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 text-center">
          <img src="/logo.svg" alt="" className="h-16 w-16 opacity-90 mb-6" />
          <h1 className="font-sans text-h1 font-bold text-text tracking-tight mb-1">
            Set up your hub
          </h1>
          <p className="text-small text-muted">
            Create a commissioner password. You’ll use it to add leagues and manage
            access codes.
          </p>
        </div>

        <div className="bg-surface border border-borderLow rounded-lg p-6">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-label text-muted uppercase font-sans mb-2 tracking-[0.06em]">
                Commissioner password
              </label>
              <PasswordInput
                value={pw}
                onChange={(v) => {
                  setPw(v)
                  setError('')
                }}
                autoFocus
                autoComplete="new-password"
                invalid={!!error}
                aria-label="Commissioner password"
              />
            </div>
            <div>
              <label className="block text-label text-muted uppercase font-sans mb-2 tracking-[0.06em]">
                Confirm
              </label>
              <PasswordInput
                value={confirm}
                onChange={(v) => {
                  setConfirm(v)
                  setError('')
                }}
                autoComplete="new-password"
                invalid={!!error}
                aria-label="Confirm password"
              />
            </div>
            {error && <p className="text-red-400 text-small font-sans">{error}</p>}
            <button
              type="submit"
              disabled={loading || !pw || !confirm}
              className="w-full bg-gold text-background font-sans font-semibold text-base py-2.5 rounded-lg transition-opacity disabled:opacity-40 hover:opacity-90"
            >
              {loading ? 'Setting up…' : 'Create'}
            </button>
          </form>
          <p className="mt-4 text-small text-mutedLow leading-relaxed">
            Next you’ll add your Sleeper leagues — the app pulls each league’s full
            history automatically.
          </p>
        </div>
      </div>
    </div>
  )
}
