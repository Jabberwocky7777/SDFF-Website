import { describe, expect, it } from 'vitest'
import { deriveCapabilities } from './capabilities.js'
import type { SleeperLeague } from '../sleeper/schemas.js'

function league(partial: Partial<SleeperLeague>): SleeperLeague {
  return {
    league_id: '1',
    name: 'Test',
    season: '2025',
    roster_positions: ['QB', 'RB', 'WR', 'TE', 'FLEX', 'BN'],
    settings: {},
    ...partial,
  } as SleeperLeague
}

describe('deriveCapabilities', () => {
  it('flags a single-season league as having no history', () => {
    const caps = deriveCapabilities({
      league: league({}),
      seasonsAvailable: 1,
      tradedPicksCount: 0,
    })
    expect(caps.hasHistory).toBe(false)
    expect(caps.seasonsAvailable).toBe(1)
  })

  it('detects superflex from roster_positions', () => {
    const caps = deriveCapabilities({
      league: league({ roster_positions: ['QB', 'RB', 'WR', 'SUPER_FLEX', 'BN'] }),
      seasonsAvailable: 3,
      tradedPicksCount: 0,
    })
    expect(caps.isSuperflex).toBe(true)
    expect(caps.hasHistory).toBe(true)
  })

  it('detects median scoring and divisions and taxi from settings', () => {
    const caps = deriveCapabilities({
      league: league({
        settings: {
          league_average_match: 1,
          divisions: 2,
          taxi_slots: 4,
          playoff_week_start: 15,
          playoff_teams: 6,
        },
      }),
      seasonsAvailable: 5,
      tradedPicksCount: 12,
    })
    expect(caps.hasMedianScoring).toBe(true)
    expect(caps.hasDivisions).toBe(true)
    expect(caps.hasTaxiSquad).toBe(true)
    expect(caps.hasTradedPicks).toBe(true)
    expect(caps.playoffWeekStart).toBe(15)
  })

  it('defaults playoff settings sensibly when absent', () => {
    const caps = deriveCapabilities({
      league: league({ settings: {} }),
      seasonsAvailable: 1,
      tradedPicksCount: 0,
    })
    expect(caps.playoffWeekStart).toBe(15)
    expect(caps.playoffTeams).toBe(6)
  })
})
