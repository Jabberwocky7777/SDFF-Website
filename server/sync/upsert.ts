/**
 * Idempotent DB writers. Every function is a plain upsert so a sync can be
 * re-run safely. No business logic here — callers pass
 * already-normalized rows.
 */
import type { DB } from '../db/index.js'
import type { DataQuality } from './dataQuality.js'

export interface LeagueSeasonRow {
  leagueId: string
  familyId: number
  season: number
  status: string | null
  previousLeagueId: string | null
  totalRosters: number | null
  playoffWeekStart: number | null
  playoffTeams: number | null
  scoringSettingsJson: string | null
  rosterPositionsJson: string | null
  settingsJson: string | null
  capabilitiesJson: string | null
  rawJson: string | null
}

export function upsertLeagueSeason(db: DB, row: LeagueSeasonRow): void {
  db.prepare(
    `INSERT INTO league_season (
       league_id, family_id, season, status, previous_league_id, total_rosters,
       playoff_week_start, playoff_teams, scoring_settings_json, roster_positions_json,
       settings_json, capabilities_json, raw_json
     ) VALUES (
       @leagueId, @familyId, @season, @status, @previousLeagueId, @totalRosters,
       @playoffWeekStart, @playoffTeams, @scoringSettingsJson, @rosterPositionsJson,
       @settingsJson, @capabilitiesJson, @rawJson
     )
     ON CONFLICT(league_id) DO UPDATE SET
       family_id = excluded.family_id,
       season = excluded.season,
       status = excluded.status,
       previous_league_id = excluded.previous_league_id,
       total_rosters = excluded.total_rosters,
       playoff_week_start = excluded.playoff_week_start,
       playoff_teams = excluded.playoff_teams,
       scoring_settings_json = excluded.scoring_settings_json,
       roster_positions_json = excluded.roster_positions_json,
       settings_json = excluded.settings_json,
       capabilities_json = excluded.capabilities_json,
       raw_json = excluded.raw_json`,
  ).run(row)
}

export interface ManagerRow {
  userId: string
  displayName: string | null
  avatar: string | null
  isSynthetic?: boolean
}

export function upsertManager(db: DB, row: ManagerRow): void {
  db.prepare(
    `INSERT INTO manager (user_id, display_name, avatar, is_synthetic)
     VALUES (@userId, @displayName, @avatar, @isSynthetic)
     ON CONFLICT(user_id) DO UPDATE SET
       display_name = COALESCE(excluded.display_name, manager.display_name),
       avatar = COALESCE(excluded.avatar, manager.avatar)`,
  ).run({ ...row, isSynthetic: row.isSynthetic ? 1 : 0 })
}

export function setManagerAlias(db: DB, staleUserId: string, canonicalUserId: string): void {
  // Ensure both rows exist so the FK holds.
  db.prepare(`INSERT OR IGNORE INTO manager (user_id) VALUES (?)`).run(staleUserId)
  db.prepare(`INSERT OR IGNORE INTO manager (user_id) VALUES (?)`).run(canonicalUserId)
  db.prepare(`UPDATE manager SET alias_of = ? WHERE user_id = ?`).run(canonicalUserId, staleUserId)
}

/** Copy the admin-managed manager_alias table into manager.alias_of before a sync. */
export function applyManagerAliases(db: DB): void {
  const rows = db
    .prepare(`SELECT alias_user_id, canonical_user_id FROM manager_alias`)
    .all() as Array<{ alias_user_id: string; canonical_user_id: string }>
  for (const r of rows) setManagerAlias(db, r.alias_user_id, r.canonical_user_id)
}

/** Follow alias_of to the canonical manager id (1 hop is the norm; guard cycles). */
export function resolveManager(db: DB, userId: string | null): string | null {
  if (!userId) return null
  let current = userId
  for (let i = 0; i < 5; i++) {
    const row = db.prepare(`SELECT alias_of FROM manager WHERE user_id = ?`).get(current) as
      | { alias_of: string | null }
      | undefined
    if (!row || !row.alias_of) return current
    current = row.alias_of
  }
  return current
}

export interface TeamSeasonRow {
  leagueId: string
  rosterId: number
  userId: string | null
  coOwnerIdsJson: string | null
  teamName: string | null
  wins: number | null
  losses: number | null
  ties: number | null
  pointsFor: number | null
  pointsAgainst: number | null
  division: number | null
  regularSeasonRank: number | null
  finalRank: number | null
}

export function upsertTeamSeason(db: DB, row: TeamSeasonRow): void {
  db.prepare(
    `INSERT INTO team_season (
       league_id, roster_id, user_id, co_owner_ids_json, team_name,
       wins, losses, ties, points_for, points_against, division,
       regular_season_rank, final_rank
     ) VALUES (
       @leagueId, @rosterId, @userId, @coOwnerIdsJson, @teamName,
       @wins, @losses, @ties, @pointsFor, @pointsAgainst, @division,
       @regularSeasonRank, @finalRank
     )
     ON CONFLICT(league_id, roster_id) DO UPDATE SET
       user_id = excluded.user_id,
       co_owner_ids_json = excluded.co_owner_ids_json,
       team_name = excluded.team_name,
       wins = excluded.wins,
       losses = excluded.losses,
       ties = excluded.ties,
       points_for = excluded.points_for,
       points_against = excluded.points_against,
       division = excluded.division,
       regular_season_rank = excluded.regular_season_rank,
       final_rank = COALESCE(excluded.final_rank, team_season.final_rank)`,
  ).run(row)
}

export function updateFinalRank(
  db: DB,
  leagueId: string,
  rosterId: number,
  finalRank: number | null,
): void {
  db.prepare(`UPDATE team_season SET final_rank = ? WHERE league_id = ? AND roster_id = ?`).run(
    finalRank,
    leagueId,
    rosterId,
  )
}

export interface MatchupRow {
  leagueId: string
  week: number
  matchupId: number | null
  rosterId: number
  userId: string | null
  points: number | null
  opponentRosterId: number | null
  opponentUserId: string | null
  opponentPoints: number | null
  result: 'W' | 'L' | 'T' | null
  isPlayoff: boolean
  isConsolation: boolean
  medianResult: 'W' | 'L' | null
  /** NULL when the row's scores are trustworthy; see server/sync/dataQuality.ts. */
  dataQuality: DataQuality | null
  startersJson: string | null
  startersPointsJson: string | null
  playersJson: string | null
  playersPointsJson: string | null
}

export function upsertMatchup(db: DB, row: MatchupRow): void {
  db.prepare(
    `INSERT INTO matchup (
       league_id, week, matchup_id, roster_id, user_id, points,
       opponent_roster_id, opponent_user_id, opponent_points, result,
       is_playoff, is_consolation, median_result, data_quality,
       starters_json, starters_points_json, players_json, players_points_json
     ) VALUES (
       @leagueId, @week, @matchupId, @rosterId, @userId, @points,
       @opponentRosterId, @opponentUserId, @opponentPoints, @result,
       @isPlayoff, @isConsolation, @medianResult, @dataQuality,
       @startersJson, @startersPointsJson, @playersJson, @playersPointsJson
     )
     ON CONFLICT(league_id, week, roster_id) DO UPDATE SET
       matchup_id = excluded.matchup_id,
       user_id = excluded.user_id,
       points = excluded.points,
       opponent_roster_id = excluded.opponent_roster_id,
       opponent_user_id = excluded.opponent_user_id,
       opponent_points = excluded.opponent_points,
       result = excluded.result,
       is_playoff = excluded.is_playoff,
       is_consolation = excluded.is_consolation,
       median_result = excluded.median_result,
       data_quality = excluded.data_quality,
       starters_json = excluded.starters_json,
       starters_points_json = excluded.starters_points_json,
       players_json = excluded.players_json,
       players_points_json = excluded.players_points_json`,
  ).run({
    ...row,
    isPlayoff: row.isPlayoff ? 1 : 0,
    isConsolation: row.isConsolation ? 1 : 0,
  })
}

export interface PlayerWeekRosterRow {
  leagueId: string
  season: number
  week: number
  playerId: string
  rosterId: number
  userId: string | null
  points: number | null
  started: boolean
}

export function upsertPlayerWeekRoster(db: DB, row: PlayerWeekRosterRow): void {
  db.prepare(
    `INSERT INTO player_week_roster (league_id, season, week, player_id, roster_id, user_id, points, started)
     VALUES (@leagueId, @season, @week, @playerId, @rosterId, @userId, @points, @started)
     ON CONFLICT(league_id, week, player_id) DO UPDATE SET
       season = excluded.season,
       roster_id = excluded.roster_id,
       user_id = excluded.user_id,
       points = excluded.points,
       started = excluded.started`,
  ).run({ ...row, started: row.started ? 1 : 0 })
}

export interface TransactionRow {
  id: string
  leagueId: string
  week: number | null
  type: string
  status: string | null
  createdMs: number | null
  rosterIdsJson: string | null
  addsJson: string | null
  dropsJson: string | null
  draftPicksJson: string | null
  waiverBid: number | null
  rawJson: string | null
}

export function upsertTransaction(db: DB, row: TransactionRow): void {
  db.prepare(
    `INSERT INTO transaction_record (
       id, league_id, week, type, status, created_ms, roster_ids_json,
       adds_json, drops_json, draft_picks_json, waiver_bid, raw_json
     ) VALUES (
       @id, @leagueId, @week, @type, @status, @createdMs, @rosterIdsJson,
       @addsJson, @dropsJson, @draftPicksJson, @waiverBid, @rawJson
     )
     ON CONFLICT(id) DO UPDATE SET
       week = excluded.week,
       type = excluded.type,
       status = excluded.status,
       created_ms = excluded.created_ms,
       roster_ids_json = excluded.roster_ids_json,
       adds_json = excluded.adds_json,
       drops_json = excluded.drops_json,
       draft_picks_json = excluded.draft_picks_json,
       waiver_bid = excluded.waiver_bid,
       raw_json = excluded.raw_json`,
  ).run(row)
}

export interface TradeRow {
  id: string
  leagueId: string
  familyId: number | null
  season: number | null
  week: number | null
  createdMs: number | null
  teamCount: number | null
  rosterIdsJson: string | null
  isOffseason: boolean
}

export function upsertTrade(db: DB, row: TradeRow): void {
  db.prepare(
    `INSERT INTO trade (id, league_id, family_id, season, week, created_ms, team_count, roster_ids_json, is_offseason)
     VALUES (@id, @leagueId, @familyId, @season, @week, @createdMs, @teamCount, @rosterIdsJson, @isOffseason)
     ON CONFLICT(id) DO UPDATE SET
       league_id = excluded.league_id,
       family_id = excluded.family_id,
       season = excluded.season,
       week = excluded.week,
       created_ms = excluded.created_ms,
       team_count = excluded.team_count,
       roster_ids_json = excluded.roster_ids_json,
       is_offseason = excluded.is_offseason`,
  ).run({ ...row, isOffseason: row.isOffseason ? 1 : 0 })
}

export interface TradeAssetRow {
  tradeId: string
  assetType: 'player' | 'pick' | 'faab'
  playerId: string | null
  pickSeason: number | null
  pickRound: number | null
  pickOriginalRosterId: number | null
  faabAmount: number | null
  fromRosterId: number | null
  toRosterId: number | null
  fromUserId: string | null
  toUserId: string | null
}

/** Trade assets are fully replaced for a trade each sync (cheap, keeps it clean). */
export function replaceTradeAssets(
  db: DB,
  tradeId: string,
  assets: Omit<TradeAssetRow, 'tradeId'>[],
): void {
  db.prepare(`DELETE FROM trade_asset WHERE trade_id = ?`).run(tradeId)
  const stmt = db.prepare(
    `INSERT INTO trade_asset (
       trade_id, asset_type, player_id, pick_season, pick_round, pick_original_roster_id,
       faab_amount, from_roster_id, to_roster_id, from_user_id, to_user_id
     ) VALUES (
       @tradeId, @assetType, @playerId, @pickSeason, @pickRound, @pickOriginalRosterId,
       @faabAmount, @fromRosterId, @toRosterId, @fromUserId, @toUserId
     )`,
  )
  for (const a of assets) stmt.run({ ...a, tradeId })
}

export interface DraftPickRow {
  draftId: string
  pickNo: number
  leagueId: string | null
  season: number | null
  round: number | null
  rosterId: number | null
  userId: string | null
  playerId: string | null
  isKeeper: boolean
}

export function upsertDraftPick(db: DB, row: DraftPickRow): void {
  db.prepare(
    `INSERT INTO draft_pick (draft_id, pick_no, league_id, season, round, roster_id, user_id, player_id, is_keeper)
     VALUES (@draftId, @pickNo, @leagueId, @season, @round, @rosterId, @userId, @playerId, @isKeeper)
     ON CONFLICT(draft_id, pick_no) DO UPDATE SET
       league_id = excluded.league_id,
       season = excluded.season,
       round = excluded.round,
       roster_id = excluded.roster_id,
       user_id = excluded.user_id,
       player_id = excluded.player_id,
       is_keeper = excluded.is_keeper`,
  ).run({ ...row, isKeeper: row.isKeeper ? 1 : 0 })
}

export interface TradedPickRow {
  leagueId: string
  pickSeason: string
  round: number
  originalRosterId: number
  currentOwnerRosterId: number
  previousOwnerRosterId: number | null
}

export function upsertTradedPick(db: DB, row: TradedPickRow): void {
  db.prepare(
    `INSERT INTO traded_pick (league_id, pick_season, round, original_roster_id, current_owner_roster_id, previous_owner_roster_id)
     VALUES (@leagueId, @pickSeason, @round, @originalRosterId, @currentOwnerRosterId, @previousOwnerRosterId)
     ON CONFLICT(league_id, pick_season, round, original_roster_id) DO UPDATE SET
       current_owner_roster_id = excluded.current_owner_roster_id,
       previous_owner_roster_id = excluded.previous_owner_roster_id`,
  ).run(row)
}

// ── Sync bookkeeping ─────────────────────────────────────────────────────────

export function startSyncLog(db: DB, leagueId: string | null, scope: string): number {
  const info = db
    .prepare(
      `INSERT INTO sync_log (league_id, scope, started_at, status) VALUES (?, ?, ?, 'running')`,
    )
    .run(leagueId, scope, Date.now())
  return Number(info.lastInsertRowid)
}

export function finishSyncLog(
  db: DB,
  id: number,
  status: 'ok' | 'error',
  opts: { error?: string; recordsWritten?: number; cursor?: string } = {},
): void {
  db.prepare(
    `UPDATE sync_log SET finished_at = ?, status = ?, error = ?, records_written = ?, cursor = ?
     WHERE id = ?`,
  ).run(
    Date.now(),
    status,
    opts.error ?? null,
    opts.recordsWritten ?? null,
    opts.cursor ?? null,
    id,
  )
}

export function getKv(db: DB, key: string): string | null {
  const row = db.prepare(`SELECT value FROM kv WHERE key = ?`).get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

export function setKv(db: DB, key: string, value: string): void {
  db.prepare(
    `INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value)
}
