import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { adminFetch, apiFetch } from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { createAnnouncement, deleteAnnouncement, togglePin } from '@/api/announcements'
import { useAnnouncements } from '@/hooks/useAnnouncements'
import GoldRule from '@/components/ui/GoldRule'
import { duesRecords, championshipHistory, DUES_YEARS } from '@/data/dues'
import type { PaymentStatus, ChampionshipRecord } from '@/data/dues'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function PaymentBadge({ status, onClick, disabled }: { status: string; onClick?: () => void; disabled?: boolean }) {
  const base = 'inline-flex items-center gap-1 text-label font-semibold px-2 py-0.5 rounded transition-opacity'
  const interactive = onClick ? 'cursor-pointer hover:opacity-80 active:opacity-60' : ''
  const disabledCls = disabled ? 'opacity-40 cursor-not-allowed' : ''
  if (status === 'paid') {
    return (
      <span onClick={!disabled ? onClick : undefined}
            className={`${base} ${interactive} ${disabledCls} bg-green-900/40 text-green-400`}>
        ✓ Paid
      </span>
    )
  }
  if (status === 'unpaid') {
    return (
      <span onClick={!disabled ? onClick : undefined}
            className={`${base} ${interactive} ${disabledCls} bg-red-900/40 text-red-400`}>
        ✗ Unpaid
      </span>
    )
  }
  return (
    <span onClick={!disabled ? onClick : undefined}
          className={`${base} ${interactive} ${disabledCls} text-mutedLow`}>
      —
    </span>
  )
}

const adminSortedRecords = [...duesRecords].sort((a, b) => a.managerName.localeCompare(b.managerName))

const CHAMP_FIELDS: { key: keyof Omit<ChampionshipRecord, 'year'>; label: string }[] = [
  { key: 'champion', label: 'Champion' },
  { key: 'runnerUp', label: 'Runner-Up' },
  { key: 'thirdPlace', label: '3rd Place' },
  { key: 'regularSeasonWinner', label: 'Reg. Season Winner' },
]

function AdminLocked() {
  return (
    <div className="max-w-sm mx-auto mt-16 text-center">
      <h1 className="font-sans text-h1 font-bold text-text mb-2">Admin Panel</h1>
      <p className="text-base text-muted mb-6">
        Sign in with the commissioner (admin) code to manage announcements, dues,
        and championship history.
      </p>
      <Link
        to="/"
        className="inline-block bg-gold text-background font-sans font-semibold text-base px-5 py-2.5 rounded-lg hover:opacity-90 transition-opacity"
      >
        Go to sign in
      </Link>
    </div>
  )
}

function AdminPanel() {
  const qc = useQueryClient()
  const { data: announcements } = useAnnouncements()

  // ── Announcement state ──────────────────────────────────────────────────
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [pinned, setPinned] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  // ── Dues editor state ───────────────────────────────────────────────────
  const [duesSaving, setDuesSaving] = useState<Record<string, boolean>>({})
  const [duesSaveMsg, setDuesSaveMsg] = useState<Record<string, string>>({})

  // ── Championship editor state ───────────────────────────────────────────
  const [champInputs, setChampInputs] = useState<Record<string, string>>({})
  const [champStatus, setChampStatus] = useState<Record<string, 'saving' | 'saved' | 'error'>>({})

  // ── Squad pot state ─────────────────────────────────────────────────────
  const [squadPotInput, setSquadPotInput] = useState<string | null>(null)
  const [squadPotStatus, setSquadPotStatus] = useState<'saving' | 'saved' | 'error' | ''>('')

  // ── Queries ─────────────────────────────────────────────────────────────
  const { data: duesOverrides = {} } = useQuery<Record<string, PaymentStatus>>({
    queryKey: ['dues-overrides'],
    queryFn: () => apiFetch('/dues-overrides'),
  })

  const { data: championshipOverrides = [] } = useQuery<ChampionshipRecord[]>({
    queryKey: ['championship-overrides'],
    queryFn: () => apiFetch('/championship-overrides'),
  })

  const { data: squadPotData } = useQuery<{ balance: number | null }>({
    queryKey: ['squad-pot'],
    queryFn: () => apiFetch('/squad-pot'),
  })

  useEffect(() => {
    if (squadPotInput === null && squadPotData?.balance != null) {
      setSquadPotInput(String(squadPotData.balance))
    }
  }, [squadPotData, squadPotInput])

  // ── Derived / merge helpers ─────────────────────────────────────────────
  const mergedChampionshipHistory: ChampionshipRecord[] = championshipHistory.map((rec) => {
    const override = championshipOverrides.find((o) => o.year === rec.year)
    return override ? { ...rec, ...override } : rec
  })

  function getMergedDuesStatus(managerName: string, year: number): PaymentStatus {
    const key = `${managerName}_${year}`
    if (key in duesOverrides) return duesOverrides[key]
    const record = duesRecords.find((r) => r.managerName === managerName)
    return record?.payments[String(year)] ?? 'na'
  }

  function getChampFieldValue(year: number, field: string): string {
    const key = `${year}_${field}`
    if (key in champInputs) return champInputs[key]
    const rec = mergedChampionshipHistory.find((r) => r.year === year)
    if (!rec) return ''
    const val = rec[field as keyof ChampionshipRecord]
    return typeof val === 'string' ? val : ''
  }

  const squadPotDisplayValue =
    squadPotInput ?? (squadPotData?.balance != null ? String(squadPotData.balance) : '')

  // ── Announcement handlers ───────────────────────────────────────────────
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

  const { logout } = useAuth()
  function handleLogout() {
    void logout().then(() => {
      window.location.href = '/'
    })
  }

  // ── Dues editor handler ─────────────────────────────────────────────────
  async function handleDuesClick(managerName: string, year: number) {
    const key = `${managerName}_${year}`
    const currentStatus = getMergedDuesStatus(managerName, year)
    const newStatus: PaymentStatus = currentStatus === 'paid' ? 'unpaid' : 'paid'
    setDuesSaving((s) => ({ ...s, [key]: true }))
    setDuesSaveMsg((s) => ({ ...s, [key]: '' }))
    try {
      await adminFetch('/admin/dues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managerName, year, status: newStatus }),
      })
      await qc.invalidateQueries({ queryKey: ['dues-overrides'] })
      setDuesSaveMsg((s) => ({ ...s, [key]: '✓' }))
    } catch {
      setDuesSaveMsg((s) => ({ ...s, [key]: '!' }))
    }
    setDuesSaving((s) => ({ ...s, [key]: false }))
  }

  // ── Championship editor handler ─────────────────────────────────────────
  async function handleChampSave(year: number, field: string) {
    const key = `${year}_${field}`
    const value = getChampFieldValue(year, field)
    setChampStatus((s) => ({ ...s, [key]: 'saving' }))
    try {
      await adminFetch('/admin/championship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, field, value: value.trim() || null }),
      })
      await qc.invalidateQueries({ queryKey: ['championship-overrides'] })
      setChampStatus((s) => ({ ...s, [key]: 'saved' }))
    } catch {
      setChampStatus((s) => ({ ...s, [key]: 'error' }))
    }
  }

  // ── Squad pot handler ───────────────────────────────────────────────────
  async function handleSquadPotSave() {
    const balance = parseFloat(squadPotDisplayValue)
    if (isNaN(balance)) return
    setSquadPotStatus('saving')
    try {
      await adminFetch('/admin/squad-pot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ balance }),
      })
      await qc.invalidateQueries({ queryKey: ['squad-pot'] })
      setSquadPotStatus('saved')
    } catch {
      setSquadPotStatus('error')
    }
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

      {/* ── Create announcement form ────────────────────────────────────────── */}
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

      {/* ── Existing announcements ──────────────────────────────────────────── */}
      <h2 className="text-label text-muted uppercase tracking-[0.04em] font-semibold mb-4">
        Existing ({announcements?.length ?? 0})
      </h2>

      {(!announcements || announcements.length === 0) && (
        <p className="text-base text-muted font-sans">No announcements yet.</p>
      )}

      <div className="space-y-3 mb-8">
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

      {/* ── Section A: Dues Editor ──────────────────────────────────────────── */}
      <GoldRule className="mb-6" />

      <div className="mb-8">
        <h2 className="text-label text-muted uppercase tracking-[0.04em] font-semibold mb-1">
          Dues Editor
        </h2>
        <p className="text-small text-muted mb-4">
          Click a cell to toggle paid/unpaid. Manager IDs not yet linked to Sleeper accounts — dues status is matched by name only.
        </p>

        <div className="bg-surface border border-borderLow rounded-lg overflow-x-auto">
          <div
            className="grid bg-surfaceHi border-b border-borderLow px-4 py-3 min-w-[38rem]"
            style={{ gridTemplateColumns: `1fr repeat(${DUES_YEARS.length}, 7.5rem)` }}
          >
            <div className="text-label text-muted uppercase tracking-[0.04em] font-semibold">Manager</div>
            {DUES_YEARS.map((year) => (
              <div key={year} className="text-label text-muted uppercase tracking-[0.04em] font-semibold text-center">
                {year}
              </div>
            ))}
          </div>

          {adminSortedRecords.map((rec) => (
            <div
              key={rec.managerName}
              className="grid border-b border-borderLow last:border-0 px-4 py-3 min-w-[38rem]"
              style={{ gridTemplateColumns: `1fr repeat(${DUES_YEARS.length}, 7.5rem)` }}
            >
              <div className="text-base font-semibold text-text">{rec.managerName}</div>
              {DUES_YEARS.map((year) => {
                const key = `${rec.managerName}_${year}`
                const status = getMergedDuesStatus(rec.managerName, year)
                const saving = duesSaving[key]
                const msg = duesSaveMsg[key]
                return (
                  <div key={year} className="flex flex-col items-center justify-center gap-0.5">
                    <PaymentBadge
                      status={status}
                      onClick={() => handleDuesClick(rec.managerName, year)}
                      disabled={saving}
                    />
                    {msg && (
                      <span className={`text-[10px] font-bold leading-none ${msg === '✓' ? 'text-green-400' : 'text-red-400'}`}>
                        {msg}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── Section B: Championship History Editor ──────────────────────────── */}
      <GoldRule className="mb-6" />

      <div className="mb-8">
        <h2 className="text-label text-muted uppercase tracking-[0.04em] font-semibold mb-4">
          Championship History Editor
        </h2>

        <div className="space-y-4">
          {mergedChampionshipHistory.map((rec) => (
            <div key={rec.year} className="bg-surface border border-borderLow rounded-lg p-4">
              <div className="text-base font-bold text-gold mb-3">{rec.year}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CHAMP_FIELDS.map(({ key: field, label }) => {
                  const key = `${rec.year}_${field}`
                  const status = champStatus[key]
                  return (
                    <div key={field}>
                      <label className="block text-label text-muted uppercase font-sans mb-1">{label}</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={getChampFieldValue(rec.year, field)}
                          onChange={(e) =>
                            setChampInputs((s) => ({ ...s, [key]: e.target.value }))
                          }
                          placeholder="TBD"
                          className="flex-1 bg-background border border-borderLow focus:border-border rounded-lg px-3 py-1.5 font-sans text-base text-text placeholder-muted/50 outline-none transition-colors"
                        />
                        <button
                          onClick={() => handleChampSave(rec.year, field)}
                          disabled={status === 'saving'}
                          className="shrink-0 bg-gold/20 hover:bg-gold/30 text-gold text-small font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                        >
                          {status === 'saving' ? '…' : 'Save'}
                        </button>
                        {status === 'saved' && <span className="text-green-400 text-small self-center">✓</span>}
                        {status === 'error' && <span className="text-red-400 text-small self-center">✗</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Section C: Squad Pot Balance ────────────────────────────────────── */}
      <GoldRule className="mb-6" />

      <div className="mb-8">
        <h2 className="text-label text-muted uppercase tracking-[0.04em] font-semibold mb-1">
          Squad Pot Balance
        </h2>
        <p className="text-small text-muted mb-4">
          Overrides the automatic date-based calculation on the Dues page.
        </p>

        <div className="bg-surface border border-borderLow rounded-lg p-4 max-w-xs">
          <label className="block text-label text-muted uppercase font-sans mb-1.5">Balance ($)</label>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              min="0"
              step="1"
              value={squadPotDisplayValue}
              onChange={(e) => setSquadPotInput(e.target.value)}
              placeholder="0"
              className="w-32 bg-background border border-borderLow focus:border-border rounded-lg px-3 py-2 font-sans text-base text-text placeholder-muted/50 outline-none transition-colors"
            />
            <button
              onClick={handleSquadPotSave}
              disabled={squadPotStatus === 'saving' || squadPotDisplayValue === ''}
              className="bg-gold text-background font-sans font-semibold text-base px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {squadPotStatus === 'saving' ? 'Saving…' : 'Set Balance'}
            </button>
            {squadPotStatus === 'saved' && <span className="text-green-400 text-small">✓ Saved</span>}
            {squadPotStatus === 'error' && <span className="text-red-400 text-small">✗ Failed</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Admin() {
  const { admin } = useAuth()
  return admin ? <AdminPanel /> : <AdminLocked />
}
