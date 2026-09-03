export interface SleeperLeague {
  league_id: string
  name: string
  season: string
  total_rosters: number
  scoring_settings: Record<string, number>
  roster_positions: string[]
  settings: {
    num_teams: number
    playoff_week_start: number
    trade_deadline: number
    taxi_slots: number
    taxi_years: number
    taxi_allow_vets: number
    max_keepers: number
    draft_rounds: number
    reserve_slots: number
  }
  status: 'pre_draft' | 'drafting' | 'in_season' | 'complete'
  draft_id: string
}

export interface SleeperUser {
  user_id: string
  display_name: string
  avatar: string | null
  metadata: {
    team_name?: string
    avatar?: string
  }
}

export interface SleeperRoster {
  roster_id: number
  owner_id: string
  players: string[]
  taxi: string[] | null
  starters: string[]
  reserve: string[] | null
  co_owners: string[] | null
  settings: {
    wins: number
    losses: number
    ties: number
    fpts: number
    fpts_decimal: number
    fpts_against: number
    fpts_against_decimal: number
    max_points?: number
    max_points_decimal?: number
    total_moves?: number
    waiver_budget_used?: number
    waiver_position?: number
  }
}

export interface SleeperMatchup {
  roster_id: number
  matchup_id: number
  points: number
  players: string[]
  starters: string[]
  players_points: Record<string, number>
  starters_points: number[]
  custom_points: number | null
}

export interface SleeperNflState {
  week: number
  season: string
  season_type: 'pre' | 'regular' | 'post' | 'off'
  display_week: number
  leg: number
  season_start_date: string
}

export interface SleeperPlayer {
  player_id: string
  full_name: string
  first_name: string
  last_name: string
  position: string
  fantasy_positions: string[]
  team: string | null
  age: number | null
  birth_date: string | null
  years_exp: number
  status: string
  search_rank?: number
  injury_status: string | null
  depth_chart_position: number | null
  depth_chart_order: number | null
  metadata?: {
    rookie_year?: string
    channel_id?: string
  }
}

export type SleeperPlayersMap = Record<string, SleeperPlayer>
