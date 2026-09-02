import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/context/AuthContext'
import {
  addLeague,
  changeAdminPassword,
  deleteLeague,
  discoverLeagues,
  getAdminLeagues,
  getAdminSettings,
  resyncLeague,
  saveAdminSettings,
  updateLeague,
  type AdminLeague,
} from '@/api/hub'
import SkeletonLoader from '@/components/ui/SkeletonLoader'

const TYPES = ['dynasty', 'redraft', 'keeper', 'bestball'] as const

export default function AdminSettings() {
  const { admin, checking } = useAuth()
  const qc = useQueryClient()

  const leagues = useQuery({
    queryKey: ['admin', 'leagues'],
    queryFn: getAdminLeagues,
    enabled: admin,
    refetchInterval: (q) =>
      (q.state.data ?? []).some((l) => l.sync?.syncing || l.sync?.queued) ? 3000 : false,
  })

  if (checking) return <SkeletonLoader rows={4} />
  if (!admin) return <Navigate to="/" replace />

  const refetch = () => qc.invalidateQueries({ queryKey: ['admin', 'leagues'] })

  return (
    <div className="space-y-10">
      <div>
        <Link to="/" className="text-small text-muted hover:text-gold transition-colors">
          ← Back
        </Link>
        <h1 className="font-sans text-h1 sm:text-hero font-bold text-text mt-2">Settings</h1>
      </div>

      <section>
        <h2 className="font-sans text-h2 font-bold text-text mb-4">Leagues</h2>
        {leagues.isLoading ? (
          <SkeletonLoader rows={3} />
        ) : (
          <div className="space-y-3">
            {(leagues.data ?? []).map((l) => (
              <LeagueRow key={l.slug} league={l} onChange={refetch} />
            ))}
            {(leagues.data ?? []).length === 0 && (
              <p className="text-base text-muted">No leagues yet — add your first below.</p>
            )}
          </div>
        )}
        <AddLeague onAdded={refetch} />
      </section>

      <SettingsSection />
    </div>
  )
}

// ── One league row ─────────────────────────────────────────────────────────

function LeagueRow({ league, onChange }: { league: AdminLeague; onChange: () => void }) {
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState(false)

  const resync = useMutation({ mutationFn: () => resyncLeague(league.slug, true), onSuccess: onChange })
  const remove = useMutation({ mutationFn: () => deleteLeague(league.slug), onSuccess: onChange })

  const s = league.sync
  const status = s?.syncing
    ? 'Syncing history…'
    : s?.queued
      ? 'Queued for sync…'
      : s?.lastSync.status === 'error'
        ? `Sync failed: ${s.lastSync.error ?? 'unknown'}`
        : s && s.seasons > 0
          ? `${s.seasons} season${s.seasons === 1 ? '' : 's'} · ${s.matchups.toLocaleString()} games`
          : 'Not synced yet'

  return (
    <div className="bg-surface border border-borderLow rounded-lg p-4">
      <div className="flex items-start gap-3 flex-wrap">
        <span
          className="w-3 h-3 rounded-full mt-1.5 shrink-0"
          style={{ background: league.themeAccent ?? '#E0B544' }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-sans text-h3 font-semibold text-text">{league.displayName}</span>
            <span className="text-label text-mutedLow uppercase">{league.type}</span>
          </div>
          <div className={`text-small mt-0.5 ${s?.syncing || s?.queued ? 'text-gold' : s?.lastSync.status === 'error' ? 'text-red-400' : 'text-muted'}`}>
            {(s?.syncing || s?.queued) && <span className="inline-block w-2 h-2 rounded-full bg-gold animate-pulse mr-1.5 align-middle" />}
            {status}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => {
              navigator.clipboard?.writeText(league.accessCode)
              setCopied(true)
              setTimeout(() => setCopied(false), 1200)
            }}
            className="font-mono text-num tracking-[0.15em] bg-background border border-borderLow rounded px-2.5 py-1 text-text hover:border-border transition-colors"
            title="Access code — click to copy"
          >
            {copied ? 'copied' : league.accessCode}
          </button>
          <button onClick={() => setEditing((e) => !e)} className="text-small text-muted hover:text-gold transition-colors">
            {editing ? 'Close' : 'Edit'}
          </button>
        </div>
      </div>

      {editing && (
        <EditLeague
          league={league}
          onSaved={() => {
            setEditing(false)
            onChange()
          }}
          onResync={() => resync.mutate()}
          onRemove={() => {
            if (confirm(`Remove "${league.displayName}" and all its stored history?`)) remove.mutate()
          }}
          resyncing={resync.isPending}
        />
      )}
    </div>
  )
}

function EditLeague({
  league,
  onSaved,
  onResync,
  onRemove,
  resyncing,
}: {
  league: AdminLeague
  onSaved: () => void
  onResync: () => void
  onRemove: () => void
  resyncing: boolean
}) {
  const [displayName, setDisplayName] = useState(league.displayName)
  const [type, setType] = useState(league.type)
  const [accessCode, setAccessCode] = useState(league.accessCode)
  const [currentLeagueId, setCurrentLeagueId] = useState(league.currentLeagueId)
  const [themeAccent, setThemeAccent] = useState(league.themeAccent ?? '#E0B544')
  const [error, setError] = useState('')

  const save = useMutation({
    mutationFn: () =>
      updateLeague(league.slug, { displayName, type, accessCode, currentLeagueId, themeAccent }),
    onSuccess: onSaved,
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Save failed'),
  })

  return (
    <div className="mt-4 pt-4 border-t border-borderLow grid gap-3 sm:grid-cols-2">
      <Field label="Display name">
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputCls} />
      </Field>
      <Field label="Type">
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className={inputCls}>
          {TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </Field>
      <Field label="Access code">
        <input value={accessCode} onChange={(e) => setAccessCode(e.target.value.toUpperCase())} className={`${inputCls} font-mono tracking-[0.12em]`} />
      </Field>
      <Field label="Accent colour">
        <input type="color" value={themeAccent} onChange={(e) => setThemeAccent(e.target.value)} className="h-10 w-full bg-background border border-borderLow rounded-lg" />
      </Field>
      <Field label="Current Sleeper league ID" hint="Update this when a new dynasty season starts">
        <input value={currentLeagueId} onChange={(e) => setCurrentLeagueId(e.target.value)} className={`${inputCls} font-mono`} />
      </Field>

      {error && <p className="text-red-400 text-small sm:col-span-2">{error}</p>}

      <div className="sm:col-span-2 flex items-center gap-3 flex-wrap pt-1">
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="bg-gold text-background font-semibold text-small px-4 py-2 rounded-lg disabled:opacity-40"
        >
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onResync} disabled={resyncing} className="text-small text-muted hover:text-gold transition-colors">
          {resyncing ? 'Re-syncing…' : 'Re-sync history'}
        </button>
        <button onClick={onRemove} className="text-small text-red-400/80 hover:text-red-400 transition-colors ml-auto">
          Remove league
        </button>
      </div>
    </div>
  )
}

// ── Add a league ───────────────────────────────────────────────────────────

function AddLeague({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'find' | 'id'>('find')
  const [leagueId, setLeagueId] = useState('')
  const [error, setError] = useState('')

  const discover = useQuery({
    queryKey: ['admin', 'discover'],
    queryFn: () => discoverLeagues(),
    enabled: open && mode === 'find',
    retry: false,
  })

  const add = useMutation({
    mutationFn: (currentLeagueId: string) => addLeague({ currentLeagueId }),
    onSuccess: () => {
      setLeagueId('')
      setError('')
      onAdded()
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Could not add league'),
  })

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 bg-gold text-background font-semibold text-small px-4 py-2.5 rounded-lg hover:opacity-90 transition-opacity"
      >
        + Add a league
      </button>
    )
  }

  return (
    <div className="mt-4 bg-surface border border-borderLow rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 bg-surfaceHi border border-borderLow rounded-lg p-1">
          {(['find', 'id'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 text-small font-semibold rounded-md transition-all ${
                mode === m ? 'bg-gold text-[#1A1100]' : 'text-muted hover:text-text'
              }`}
            >
              {m === 'find' ? 'Find my leagues' : 'Paste a league ID'}
            </button>
          ))}
        </div>
        <button onClick={() => setOpen(false)} className="text-small text-muted hover:text-gold">Close</button>
      </div>

      {mode === 'find' ? (
        discover.isLoading ? (
          <SkeletonLoader rows={3} />
        ) : discover.isError ? (
          <p className="text-small text-red-400">
            {(discover.error as Error).message}. Set your Sleeper username in Settings below.
          </p>
        ) : (
          <div className="space-y-2">
            {(discover.data ?? []).map((d) => (
              <div key={d.currentLeagueId} className="flex items-center gap-3 p-3 bg-background border border-borderLow rounded-lg">
                <div className="flex-1 min-w-0">
                  <div className="text-base font-semibold text-text truncate">{d.name}</div>
                  <div className="text-small text-muted">
                    {d.type} · {d.seasonsAvailable} season{d.seasonsAvailable === 1 ? '' : 's'}
                    {d.seasonRange ? ` (${d.seasonRange[0]}–${d.seasonRange[1]})` : ''}
                  </div>
                </div>
                {d.alreadyAdded ? (
                  <span className="text-small text-mutedLow">Added</span>
                ) : (
                  <button
                    onClick={() => add.mutate(d.currentLeagueId)}
                    disabled={add.isPending}
                    className="bg-gold text-background font-semibold text-small px-3 py-1.5 rounded-lg disabled:opacity-40"
                  >
                    Add
                  </button>
                )}
              </div>
            ))}
            {(discover.data ?? []).length === 0 && (
              <p className="text-small text-muted">No leagues found for that username.</p>
            )}
          </div>
        )
      ) : (
        <div className="flex gap-2">
          <input
            value={leagueId}
            onChange={(e) => setLeagueId(e.target.value.trim())}
            placeholder="Sleeper league ID"
            className={`${inputCls} font-mono flex-1`}
          />
          <button
            onClick={() => add.mutate(leagueId)}
            disabled={!/^\d+$/.test(leagueId) || add.isPending}
            className="bg-gold text-background font-semibold text-small px-4 py-2 rounded-lg disabled:opacity-40"
          >
            {add.isPending ? 'Adding…' : 'Add'}
          </button>
        </div>
      )}
      {error && <p className="text-red-400 text-small mt-2">{error}</p>}
    </div>
  )
}

// ── Settings section ───────────────────────────────────────────────────────

function SettingsSection() {
  const settings = useQuery({ queryKey: ['admin', 'settings'], queryFn: getAdminSettings })
  const [username, setUsername] = useState<string | null>(null)
  const [pwCurrent, setPwCurrent] = useState('')
  const [pwNext, setPwNext] = useState('')
  const [pwMsg, setPwMsg] = useState('')

  const saveUser = useMutation({
    mutationFn: (u: string) => saveAdminSettings(u),
  })
  const changePw = useMutation({
    mutationFn: () => changeAdminPassword(pwCurrent, pwNext),
    onSuccess: () => {
      setPwCurrent('')
      setPwNext('')
      setPwMsg('Password changed.')
    },
    onError: (e: unknown) => setPwMsg(e instanceof Error ? e.message : 'Failed'),
  })

  const userValue = username ?? settings.data?.sleeperUsername ?? ''

  return (
    <section className="space-y-6">
      <h2 className="font-sans text-h2 font-bold text-text">Account</h2>

      <div className="bg-surface border border-borderLow rounded-lg p-4 max-w-md">
        <Field label="Sleeper username" hint="Used by “Find my leagues”">
          <div className="flex gap-2">
            <input value={userValue} onChange={(e) => setUsername(e.target.value)} className={`${inputCls} flex-1`} />
            <button
              onClick={() => saveUser.mutate(userValue)}
              disabled={saveUser.isPending}
              className="bg-gold text-background font-semibold text-small px-4 py-2 rounded-lg disabled:opacity-40"
            >
              {saveUser.isPending ? '…' : saveUser.isSuccess ? 'Saved' : 'Save'}
            </button>
          </div>
        </Field>
      </div>

      <div className="bg-surface border border-borderLow rounded-lg p-4 max-w-md space-y-3">
        <div className="text-label text-muted uppercase tracking-[0.05em] font-semibold">
          Change commissioner password
        </div>
        <input
          type="password"
          value={pwCurrent}
          onChange={(e) => setPwCurrent(e.target.value)}
          placeholder="Current password"
          autoComplete="current-password"
          className={inputCls}
        />
        <input
          type="password"
          value={pwNext}
          onChange={(e) => setPwNext(e.target.value)}
          placeholder="New password (min 6)"
          autoComplete="new-password"
          className={inputCls}
        />
        {pwMsg && <p className="text-small text-muted">{pwMsg}</p>}
        <button
          onClick={() => changePw.mutate()}
          disabled={changePw.isPending || pwNext.length < 6}
          className="bg-gold text-background font-semibold text-small px-4 py-2 rounded-lg disabled:opacity-40"
        >
          {changePw.isPending ? 'Saving…' : 'Update password'}
        </button>
      </div>
    </section>
  )
}

// ── shared bits ────────────────────────────────────────────────────────────

const inputCls =
  'bg-background border border-borderLow focus:border-border rounded-lg px-3 py-2 text-base text-text outline-none transition-colors w-full'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-label text-muted uppercase tracking-[0.05em] font-semibold mb-1.5">
        {label}
      </span>
      {children}
      {hint && <span className="block text-small text-mutedLow mt-1">{hint}</span>}
    </label>
  )
}
