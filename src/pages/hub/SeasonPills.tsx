import type { ReactNode } from 'react'

export function SeasonPill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-small font-semibold rounded-md border transition-colors whitespace-nowrap ${
        active
          ? 'bg-gold text-[#1A1100] border-gold'
          : 'bg-surface text-muted border-borderLow hover:text-text hover:border-border'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * A season filter row. `allTimeLabel` adds a leading "everything" pill; omit it
 * for views that always need a specific season (drafts, brackets, matchups).
 */
export default function SeasonPills<T extends number | 'all'>({
  seasons,
  value,
  onChange,
  allTimeLabel,
  className = '',
}: {
  seasons: number[]
  value: T | null
  onChange: (v: T) => void
  allTimeLabel?: string
  className?: string
}) {
  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      {allTimeLabel && (
        <SeasonPill active={value === 'all'} onClick={() => onChange('all' as T)}>
          {allTimeLabel}
        </SeasonPill>
      )}
      {seasons.map((s) => (
        <SeasonPill key={s} active={value === s} onClick={() => onChange(s as T)}>
          {s}
        </SeasonPill>
      ))}
    </div>
  )
}
