/**
 * Zod schemas for the Sleeper API responses this project depends on.
 *
 * Philosophy: validate the fields we actually read, stay `.loose()` so Sleeper
 * adding fields never breaks us, and keep the raw payload around for storage.
 * See PLAN.md §1 for the endpoint reference.
 */
import { z } from 'zod'

export const nflStateSchema = z
  .object({
    week: z.number(),
    season: z.string(),
    season_type: z.string(), // 'pre' | 'regular' | 'post' | 'off'
    display_week: z.number().optional(),
    leg: z.number().optional(),
    season_start_date: z.string().optional(),
  })
  .loose()
export type NflState = z.infer<typeof nflStateSchema>

export const userSchema = z
  .object({
    user_id: z.string(),
    username: z.string().nullable().optional(),
    display_name: z.string().nullable().optional(),
    avatar: z.string().nullable().optional(),
    metadata: z
      .object({ team_name: z.string().nullable().optional() })
      .loose()
      .nullable()
      .optional(),
  })
  .loose()
export type SleeperUser = z.infer<typeof userSchema>

/** GET /user/{id}/leagues/nfl/{season} — league discovery. */
export const leagueListItemSchema = z
  .object({
    league_id: z.string(),
    name: z.string(),
    season: z.string(),
    status: z.string().nullable().optional(),
    previous_league_id: z.string().nullable().optional(),
    total_rosters: z.number().nullable().optional(),
    settings: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .loose()
export type LeagueListItem = z.infer<typeof leagueListItemSchema>

export const leagueSchema = z
  .object({
    league_id: z.string(),
    name: z.string(),
    season: z.string(),
    status: z.string().nullable().optional(),
    previous_league_id: z.string().nullable().optional(),
    draft_id: z.string().nullable().optional(),
    total_rosters: z.number().nullable().optional(),
    roster_positions: z.array(z.string()).nullable().optional(),
    scoring_settings: z.record(z.string(), z.number()).nullable().optional(),
    settings: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .loose()
export type SleeperLeague = z.infer<typeof leagueSchema>

export const rosterSchema = z
  .object({
    roster_id: z.number(),
    owner_id: z.string().nullable().optional(),
    co_owners: z.array(z.string()).nullable().optional(),
    players: z.array(z.string()).nullable().optional(),
    starters: z.array(z.string()).nullable().optional(),
    settings: z.record(z.string(), z.number()).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .loose()
export type SleeperRoster = z.infer<typeof rosterSchema>

export const matchupSchema = z
  .object({
    roster_id: z.number(),
    matchup_id: z.number().nullable().optional(),
    points: z.number().nullable().optional(),
    custom_points: z.number().nullable().optional(),
    players: z.array(z.string()).nullable().optional(),
    starters: z.array(z.string()).nullable().optional(),
    players_points: z.record(z.string(), z.number()).nullable().optional(),
    starters_points: z.array(z.number()).nullable().optional(),
  })
  .loose()
export type SleeperMatchup = z.infer<typeof matchupSchema>

/** winners_bracket / losers_bracket rows. */
export const bracketMatchSchema = z
  .object({
    r: z.number(), // round
    m: z.number(), // match id within bracket
    t1: z.union([z.number(), z.string()]).nullable().optional(),
    t2: z.union([z.number(), z.string()]).nullable().optional(),
    w: z.number().nullable().optional(),
    l: z.number().nullable().optional(),
    t1_from: z.record(z.string(), z.unknown()).nullable().optional(),
    t2_from: z.record(z.string(), z.unknown()).nullable().optional(),
    p: z.number().nullable().optional(), // placement this match decides
  })
  .loose()
export type BracketMatch = z.infer<typeof bracketMatchSchema>

export const transactionSchema = z
  .object({
    transaction_id: z.string(),
    type: z.string(), // 'trade' | 'waiver' | 'free_agent' | 'commissioner'
    status: z.string().nullable().optional(),
    created: z.number().nullable().optional(),
    leg: z.number().nullable().optional(),
    roster_ids: z.array(z.number()).nullable().optional(),
    adds: z.record(z.string(), z.number()).nullable().optional(),
    drops: z.record(z.string(), z.number()).nullable().optional(),
    draft_picks: z
      .array(
        z
          .object({
            season: z.string(),
            round: z.number(),
            roster_id: z.number(),
            previous_owner_id: z.number().nullable().optional(),
            owner_id: z.number().nullable().optional(),
          })
          .loose(),
      )
      .nullable()
      .optional(),
    waiver_budget: z
      .array(
        z.object({ sender: z.number(), receiver: z.number(), amount: z.number() }).loose(),
      )
      .nullable()
      .optional(),
    settings: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .loose()
export type SleeperTransaction = z.infer<typeof transactionSchema>

export const tradedPickSchema = z
  .object({
    season: z.string(),
    round: z.number(),
    roster_id: z.number(), // original owner
    previous_owner_id: z.number().nullable().optional(),
    owner_id: z.number(), // current owner
  })
  .loose()
export type TradedPick = z.infer<typeof tradedPickSchema>

export const draftSchema = z
  .object({
    draft_id: z.string(),
    league_id: z.string().nullable().optional(),
    type: z.string().nullable().optional(), // 'snake' | 'linear' | 'auction'
    status: z.string().nullable().optional(),
    season: z.string().nullable().optional(),
    settings: z.record(z.string(), z.unknown()).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .loose()
export type SleeperDraft = z.infer<typeof draftSchema>

export const draftPickSchema = z
  .object({
    pick_no: z.number(),
    round: z.number(),
    draft_slot: z.number().nullable().optional(),
    roster_id: z.union([z.number(), z.string()]).nullable().optional(),
    picked_by: z.string().nullable().optional(),
    player_id: z.string().nullable().optional(),
    is_keeper: z.boolean().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .loose()
export type SleeperDraftPick = z.infer<typeof draftPickSchema>

export const playerSchema = z
  .object({
    player_id: z.string().optional(),
    full_name: z.string().nullable().optional(),
    first_name: z.string().nullable().optional(),
    last_name: z.string().nullable().optional(),
    position: z.string().nullable().optional(),
    team: z.string().nullable().optional(),
    age: z.number().nullable().optional(),
    years_exp: z.number().nullable().optional(),
    status: z.string().nullable().optional(),
  })
  .loose()
export type SleeperPlayer = z.infer<typeof playerSchema>
