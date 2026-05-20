import { FormEvent, useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ADMIN_KEY } from '@/api/client'
import { createAnnouncement, deleteAnnouncement, togglePin } from '@/api/announcements'
import { useAnnouncements } from '@/hooks/useAnnouncements'
import GoldRule from '@/components/ui/GoldRule'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function AdminUnlock({ onUnlock }: { onUnlock: () => void }) {
  const [pwd, setPwd] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState(false)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!pwd.trim()) return
    sessionStorage.setItem(ADMIN_KEY, pwd.trim())
    onUnlock()
  }

  return (
    <div className="max-w-sm mx-auto mt-16">
      <div className="flex flex-col items-center mb-8">
        <h1 className="font-sans text-h1 font-bold text-text mb-1">Admin Panel</h1>
        <p className="text-small text-muted">Commissioner access</p>
      </div>

      <div className="bg-surface border border-borderLow rounded-lg p-6">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-label text-muted uppercase font-sans mb-2">
              Admin Password
            </label>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                value={pwd}
                onChange={(e) => { setPwd(e.target.value); setError(false) }}
                placeholder="Enter admin password"
                autoFocus
                className={`w-full bg-background border rounded-lg px-3 py-2.5 pr-10 font-sans text-base text-text placeholder-muted/50 outline-none transition-colors ${
                  error ? 'border-red-500/60' : 'border-borderLow focus:border-border'
                }`}
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-text transition-colors"
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
            {error && <p className="mt-1.5 text-red-400 text-small font-sans">Invalid admin password.</p>}
          </div>
          <button
            type="submit"
            disabled={!pwd.trim()}
            className="w-full bg-gold text-background font-sans font-semibold text-base py-2.5 rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Unlock
          </button>
        </form>
      </div>
    </div>
  )
}

function AdminPanel() {
  const qc = useQueryClient()
  const { data: announcements } = useAnnouncements()

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [pinned, setPinned] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || !body.trim()) { setFormError('Title and body are required.'); return }
    setSubmitting(true)
    setFormError('')
    try {
      await createAnnouncement({ title: title.trim(), body: body.trim(), pinned })
      setTitle(''); setBody(''); setPinned(false)
      await qc.invalidateQueries({ queryKey: ['announcements'] })
    } catch {
      setFormError('Failed to post. Check your admin password or server connection.')
    }
    setSubmitting(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this announcement?')) return
    try {
      await deleteAnnouncement(id)
      await qc.invalidateQueries({ queryKey: ['announcements'] })
    } catch {
      alert('Failed to delete.')
    }
  }

  async function handlePin(id: string) {
    try {
      await togglePin(id)
      await qc.invalidateQueries({ queryKey: ['announcements'] })
    } catch {
      alert('Failed to toggle pin.')
    }
  }

  function handleLogout() {
    sessionStorage.removeItem(ADMIN_KEY)
    window.location.reload()
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-sans text-h1 font-bold text-text mb-1">Admin Panel</h1>
          <p className="text-body text-muted">Post and manage league announcements.</p>
        </div>
        <button
          onClick={handleLogout}
          className="text-small font-medium text-muted hover:text-red-400 transition-colors"
        >
          Lock
        </button>
      </div>

      {/* Create form */}
      <div className="bg-surface border border-borderLow rounded-lg p-5 mb-8">
        <h2 className="text-label text-muted uppercase tracking-[0.04em] font-semibold mb-4">
          New Announcement
        </h2>

        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label className="block text-label text-muted uppercase font-sans mb-1.5">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Announcement title"
              className="w-full bg-background border border-borderLow focus:border-border rounded-lg px-3 py-2 font-sans text-base text-text placeholder-muted/50 outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-label text-muted uppercase font-sans mb-1.5">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your announcement here…"
              rows={5}
              className="w-full bg-background border border-borderLow focus:border-border rounded-lg px-3 py-2 font-sans text-base text-text placeholder-muted/50 outline-none transition-colors resize-y"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
              className="accent-gold"
            />
            <span className="text-small text-muted font-sans">Pin this announcement</span>
          </label>
          {formError && <p className="text-small text-red-400 font-sans">{formError}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="bg-gold text-background font-sans font-semibold text-base px-5 py-2 rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {submitting ? 'Posting…' : 'Post Announcement'}
          </button>
        </form>
      </div>

      <GoldRule className="mb-6" />

      {/* Existing announcements */}
      <h2 className="text-label text-muted uppercase tracking-[0.04em] font-semibold mb-4">
        Existing ({announcements?.length ?? 0})
      </h2>

      {(!announcements || announcements.length === 0) && (
        <p className="text-base text-muted font-sans">No announcements yet.</p>
      )}

      <div className="space-y-3">
        {announcements?.map((a) => (
          <div
            key={a.id}
            className={`bg-surface border rounded-lg p-4 flex items-start gap-3 ${
              a.pinned ? 'border-border' : 'border-borderLow'
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                {a.pinned && (
                  <span className="text-label text-gold font-semibold">Pinned</span>
                )}
                <span className="font-sans text-base font-semibold text-text">{a.title}</span>
              </div>
              <p className="text-small text-mutedLow">{formatDate(a.createdAt)}</p>
              <p className="text-small text-muted mt-1 line-clamp-2">{a.body}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => handlePin(a.id)}
                className="text-small font-medium text-muted hover:text-gold transition-colors"
                title={a.pinned ? 'Unpin' : 'Pin'}
              >
                {a.pinned ? 'Unpin' : 'Pin'}
              </button>
              <button
                onClick={() => handleDelete(a.id)}
                className="text-small font-medium text-muted hover:text-red-400 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Admin() {
  const [unlocked, setUnlocked] = useState(false)

  useEffect(() => {
    if (sessionStorage.getItem(ADMIN_KEY)) setUnlocked(true)
  }, [])

  if (!unlocked) return <AdminUnlock onUnlock={() => setUnlocked(true)} />
  return <AdminPanel />
}
