import type { LeagueMeta } from '@/api/hub'

function ago(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000)
  if (s < 90) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} hr ago`
  return `${Math.round(s / 86400)} days ago`
}

/** Small "history synced N ago" line under a league's pages. */
export function FreshnessNote({ meta }: { meta: LeagueMeta }) {
  if (!meta.ingested) return null
  return (
    <p className="text-label text-mutedLow mt-8 text-center">
      {meta.lastSyncAt
        ? `League history synced ${ago(meta.lastSyncAt)}`
        : 'League history is still backfilling…'}
    </p>
  )
}
