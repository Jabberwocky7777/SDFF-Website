/**
 * Derive a per-league-season capability object.
 *
 * Nav and page availability are computed from these flags — never from
 * `league.type === 'dynasty'` conditionals scattered through components.
 */
import type { SleeperLeague } from '../sleeper/schemas.js'

export interface LeagueCapabilities {
  seasonsAvailable: number
  hasHistory: boolean
  hasTradedPicks: boolean
  hasRookieDraft: boolean
  isKeeper: boolean
  isBestBall: boolean
  isSuperflex: boolean
  hasMedianScoring: boolean
  hasDivisions: boolean
  hasTaxiSquad: boolean
  playoffTeams: number
  playoffWeekStart: number
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

export function deriveCapabilities(input: {
  league: SleeperLeague
  seasonsAvailable: number
  tradedPicksCount: number
  /** Sleeper draft.type/settings for the league's own draft, if known. */
  isRookieDraft?: boolean
}): LeagueCapabilities {
  const s = (input.league.settings ?? {}) as Record<string, unknown>
  const rosterPositions = input.league.roster_positions ?? []

  const playoffWeekStart = num(s.playoff_week_start) || 15
  const playoffTeams = num(s.playoff_teams) || 6

  return {
    seasonsAvailable: input.seasonsAvailable,
    hasHistory: input.seasonsAvailable > 1,
    hasTradedPicks: input.tradedPicksCount > 0,
    hasRookieDraft: input.isRookieDraft ?? false,
    isKeeper: num(s.max_keepers) > 1 || num(s.type) === 1,
    isBestBall: num(s.best_ball) === 1,
    isSuperflex:
      rosterPositions.includes('SUPER_FLEX') ||
      rosterPositions.filter((p) => p === 'QB').length > 1,
    hasMedianScoring: num(s.league_average_match) === 1,
    hasDivisions: num(s.divisions) > 0,
    hasTaxiSquad: num(s.taxi_slots) > 0,
    playoffTeams,
    playoffWeekStart,
  }
}
