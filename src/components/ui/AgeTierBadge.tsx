import type { AgeTier } from '@/types/domain'

interface Props {
  tier: AgeTier | null
  position?: string
}

const COLOR: Record<AgeTier, string> = {
  ascending: 'text-yellow-400',
  prime: 'text-green-400',
  declining: 'text-red-400',
}

const LABEL: Record<AgeTier, string> = {
  ascending: 'Ascending (below prime)',
  prime: 'Prime',
  declining: 'Declining (past prime)',
}

export default function AgeTierBadge({ tier }: Props) {
  if (!tier) return null
  return (
    <span
      title={LABEL[tier]}
      className={`${COLOR[tier]} text-small leading-none`}
      aria-label={LABEL[tier]}
    >
      ●
    </span>
  )
}
