import { describe, expect, it } from 'vitest'
import { lastFinalWeek, nflKickoffThursday, nflWeekFinalAt } from './nflCalendar.js'

const iso = (ms: number) => new Date(ms).toISOString()
const at = (s: string) => Date.parse(s)

describe('nflKickoffThursday', () => {
  it('is the Thursday after Labor Day', () => {
    expect(iso(nflKickoffThursday(2024))).toBe('2024-09-05T00:00:00.000Z')
    expect(iso(nflKickoffThursday(2025))).toBe('2025-09-04T00:00:00.000Z')
    expect(iso(nflKickoffThursday(2026))).toBe('2026-09-10T00:00:00.000Z')
  })
})

describe('nflWeekFinalAt', () => {
  it('is the Tuesday morning after the week', () => {
    expect(iso(nflWeekFinalAt(2026, 1))).toBe('2026-09-15T11:00:00.000Z')
    expect(iso(nflWeekFinalAt(2026, 3))).toBe('2026-09-29T11:00:00.000Z')
    expect(iso(nflWeekFinalAt(2026, 4))).toBe('2026-10-06T11:00:00.000Z')
  })
})

describe('lastFinalWeek', () => {
  it('ignores the week that kicked off today', () => {
    // Thursday of week 4, synced minutes ago with live week-4 scores in the DB.
    const now = at('2026-10-01T23:00:00Z')
    expect(lastFinalWeek(2026, now, now - 5 * 60_000)).toBe(3)
  })

  it('stays on the previous week through Monday night', () => {
    const now = at('2026-10-06T04:00:00Z') // Monday night ET
    expect(lastFinalWeek(2026, now, now)).toBe(3)
  })

  it('advances once Tuesday morning arrives and a sync has run past it', () => {
    const now = at('2026-10-06T12:00:00Z')
    expect(lastFinalWeek(2026, now, at('2026-10-06T11:07:00Z'))).toBe(4)
  })

  it('does not trust a week whose last sync predates its cutoff', () => {
    const now = at('2026-10-06T12:00:00Z')
    expect(lastFinalWeek(2026, now, at('2026-10-06T03:45:00Z'))).toBe(3)
    expect(lastFinalWeek(2026, now, null)).toBe(0)
  })

  it('is 0 before week 1 is final and caps at the last week', () => {
    expect(lastFinalWeek(2026, at('2026-09-13T20:00:00Z'), at('2026-09-13T20:00:00Z'))).toBe(0)
    const later = at('2027-03-01T00:00:00Z')
    expect(lastFinalWeek(2026, later, later)).toBe(18)
  })
})
