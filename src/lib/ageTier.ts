import type { AgeTier } from '@/types/domain'

const PRIME_RANGES: Partial<Record<string, [number, number]>> = {
  RB: [22, 26],
  WR: [22, 28],
  TE: [22, 28],
  QB: [25, 30],
}

export function getAgeTier(position: string, age: number | null): AgeTier | null {
  const range = PRIME_RANGES[position]
  if (!range || age == null) return null
  const [min, max] = range
  if (age < min) return 'ascending'
  if (age > max) return 'declining'
  return 'prime'
}
