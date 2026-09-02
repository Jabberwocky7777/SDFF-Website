import type { ReactNode } from 'react'

export function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

export function fmtRecord(w: number, l: number, t = 0): string {
  return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`
}

export function fmtSigned(n: number, digits = 1): string {
  const v = n.toFixed(digits)
  return n > 0 ? `+${v}` : v
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

/** Section wrapper matching the house card style. */
export function Panel({
  title,
  children,
  right,
  className = '',
}: {
  title?: string
  children: ReactNode
  right?: ReactNode
  className?: string
}) {
  return (
    <div className={`bg-surface border border-borderLow rounded-lg ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-borderLow">
          {title && (
            <h3 className="text-label text-muted uppercase tracking-[0.06em] font-semibold">{title}</h3>
          )}
          {right}
        </div>
      )}
      {children}
    </div>
  )
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="bg-surface border border-borderLow rounded-lg p-4">
      <div className="text-label text-muted uppercase tracking-[0.05em] font-semibold mb-1.5">{label}</div>
      <div className="font-mono text-numLg font-bold text-text tabular">{value}</div>
      {sub && <div className="text-small text-muted mt-0.5">{sub}</div>}
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="bg-surface border border-borderLow rounded-lg p-10 text-center">
      <p className="text-base text-muted">{children}</p>
    </div>
  )
}

export function DeltaArrow({ movement }: { movement: number | null }) {
  if (movement == null || movement === 0) {
    return <span className="text-mutedLow text-small">—</span>
  }
  const up = movement > 0
  return (
    <span className={`text-small font-mono font-semibold ${up ? 'text-green-400' : 'text-red-400'}`}>
      {up ? '▲' : '▼'} {Math.abs(movement)}
    </span>
  )
}
