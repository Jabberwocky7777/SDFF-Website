import type { AgeTier, EnrichedRoster } from '@/types/domain'

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

export type RosterWindow = 'Rebuilding' | 'Contending' | 'Win-Now' | 'Mixed'

export interface RosterAgeProfile {
  avgAge: number | null
  youngCount: number    // age ≤ 24
  primeCount: number    // age 25–28
  agingCount: number    // age 29+
  total: number
  window: RosterWindow
}

export function computeRosterAgeProfile(roster: EnrichedRoster): RosterAgeProfile {
  // Use top 10 starters; fall back to all starters + bench if fewer than 10
  const candidates = [
    ...roster.starters,
    ...roster.bench,
  ].slice(0, 10)

  const withAge = candidates.filter((p) => p.age != null)
  const total = withAge.length

  if (total === 0) {
    return { avgAge: null, youngCount: 0, primeCount: 0, agingCount: 0, total: 0, window: 'Mixed' }
  }

  let youngCount = 0
  let primeCount = 0
  let agingCount = 0
  let ageSum = 0

  for (const p of withAge) {
    const age = p.age!
    ageSum += age
    if (age <= 24) youngCount++
    else if (age <= 28) primeCount++
    else agingCount++
  }

  const avgAge = Math.round((ageSum / total) * 10) / 10

  let window: RosterWindow
  if (youngCount / total >= 0.5) window = 'Rebuilding'
  else if (primeCount / total >= 0.5) window = 'Contending'
  else if (agingCount / total >= 0.4) window = 'Win-Now'
  else window = 'Mixed'

  return { avgAge, youngCount, primeCount, agingCount, total, window }
}
