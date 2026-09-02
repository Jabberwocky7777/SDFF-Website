-- SDFF multi-league hub — SQLite schema (baseline, migration 001).
-- Historical + computed data lives here. Live/volatile data stays on the file cache.
-- See PLAN.md §2, §11.2, §13.2.
--
-- Conventions:
--   * All Sleeper IDs are stored as TEXT (they are 64-bit snowflakes).
--   * *_json columns hold raw or lightly-normalized JSON blobs.
--   * points columns are REAL and may be NULL for weeks that never happened —
--     never SUM NULLs into NaN, filter first.

PRAGMA foreign_keys = ON;

-- A league across all its seasons (the previous_league_id chain).
CREATE TABLE IF NOT EXISTS league_family (
  id                INTEGER PRIMARY KEY,
  slug              TEXT UNIQUE NOT NULL,
  display_name      TEXT NOT NULL,
  league_type       TEXT NOT NULL,          -- 'dynasty' | 'redraft' | 'keeper' | 'bestball'
  current_league_id TEXT NOT NULL,
  sort_order        INTEGER NOT NULL DEFAULT 0
);

-- One season of one league family.
CREATE TABLE IF NOT EXISTS league_season (
  league_id             TEXT PRIMARY KEY,   -- Sleeper league_id
  family_id             INTEGER NOT NULL REFERENCES league_family(id) ON DELETE CASCADE,
  season                INTEGER NOT NULL,
  status                TEXT,               -- pre_draft | drafting | in_season | complete
  previous_league_id    TEXT,
  total_rosters         INTEGER,
  playoff_week_start    INTEGER,
  playoff_teams         INTEGER,
  scoring_settings_json TEXT,
  roster_positions_json TEXT,
  settings_json         TEXT,
  capabilities_json     TEXT,               -- derived LeagueCapabilities (PLAN.md §11.2)
  raw_json              TEXT
);
CREATE INDEX IF NOT EXISTS idx_league_season_family_season ON league_season(family_id, season);

-- Global manager identity, shared ACROSS leagues (keyed by Sleeper user_id).
CREATE TABLE IF NOT EXISTS manager (
  user_id        TEXT PRIMARY KEY,
  display_name   TEXT,
  avatar         TEXT,
  canonical_name TEXT,                      -- manual display override
  alias_of       TEXT REFERENCES manager(user_id),  -- account changes / merges
  is_synthetic   INTEGER NOT NULL DEFAULT 0 -- 1 for the "Orphan Team" placeholder
);

-- A manager's team within one league-season.
CREATE TABLE IF NOT EXISTS team_season (
  league_id           TEXT NOT NULL REFERENCES league_season(league_id) ON DELETE CASCADE,
  roster_id           INTEGER NOT NULL,
  user_id             TEXT REFERENCES manager(user_id),
  co_owner_ids_json   TEXT,
  team_name           TEXT,
  wins                INTEGER,
  losses              INTEGER,
  ties                INTEGER,
  points_for          REAL,
  points_against      REAL,
  division            INTEGER,
  regular_season_rank INTEGER,
  final_rank          INTEGER,              -- derived from brackets, not Sleeper directly
  PRIMARY KEY (league_id, roster_id)
);
CREATE INDEX IF NOT EXISTS idx_team_season_user ON team_season(user_id);

-- One row per team per week. The atomic unit of nearly every stat.
CREATE TABLE IF NOT EXISTS matchup (
  league_id            TEXT NOT NULL REFERENCES league_season(league_id) ON DELETE CASCADE,
  week                 INTEGER NOT NULL,
  matchup_id           INTEGER,             -- NULL for bye / orphan weeks
  roster_id            INTEGER NOT NULL,
  user_id              TEXT,
  points               REAL,
  opponent_roster_id   INTEGER,
  opponent_user_id     TEXT,
  opponent_points      REAL,
  result               TEXT,                -- 'W' | 'L' | 'T' | NULL
  is_playoff           INTEGER NOT NULL DEFAULT 0,
  is_consolation       INTEGER NOT NULL DEFAULT 0,
  is_median            INTEGER NOT NULL DEFAULT 0,  -- synthetic median-scoring row
  starters_json        TEXT,
  starters_points_json TEXT,
  players_json         TEXT,
  players_points_json  TEXT,
  optimal_points       REAL,                -- computed (PLAN.md §4 coaching efficiency)
  PRIMARY KEY (league_id, week, roster_id, is_median)
);
CREATE INDEX IF NOT EXISTS idx_matchup_user ON matchup(user_id);
CREATE INDEX IF NOT EXISTS idx_matchup_league_week ON matchup(league_id, week);
CREATE INDEX IF NOT EXISTS idx_matchup_opponent_user ON matchup(opponent_user_id);

-- Flattened weekly roster snapshot with per-player scoring (PLAN.md §13.1).
-- Powers trade attribution, bench-points leaderboards, coaching efficiency.
CREATE TABLE IF NOT EXISTS player_week_roster (
  league_id TEXT NOT NULL REFERENCES league_season(league_id) ON DELETE CASCADE,
  season    INTEGER NOT NULL,
  week      INTEGER NOT NULL,
  player_id TEXT NOT NULL,
  roster_id INTEGER NOT NULL,
  user_id   TEXT,
  points    REAL,
  started   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (league_id, week, player_id)
);
CREATE INDEX IF NOT EXISTS idx_pwr_player ON player_week_roster(player_id, league_id, week);
CREATE INDEX IF NOT EXISTS idx_pwr_roster_week ON player_week_roster(roster_id, week);

CREATE TABLE IF NOT EXISTS transaction_record (
  id              TEXT PRIMARY KEY,
  league_id       TEXT NOT NULL REFERENCES league_season(league_id) ON DELETE CASCADE,
  week            INTEGER,
  type            TEXT,                     -- trade | waiver | free_agent | commissioner
  status          TEXT,
  created_ms      INTEGER,
  roster_ids_json TEXT,
  adds_json       TEXT,
  drops_json      TEXT,
  draft_picks_json TEXT,
  waiver_bid      INTEGER,
  raw_json        TEXT
);
CREATE INDEX IF NOT EXISTS idx_txn_league_week ON transaction_record(league_id, week);
CREATE INDEX IF NOT EXISTS idx_txn_type ON transaction_record(type);

-- Trades, normalized for N-team support (PLAN.md §13.2).
CREATE TABLE IF NOT EXISTS trade (
  id              TEXT PRIMARY KEY,         -- Sleeper transaction_id
  league_id       TEXT NOT NULL REFERENCES league_season(league_id) ON DELETE CASCADE,
  family_id       INTEGER REFERENCES league_family(id) ON DELETE CASCADE,
  season          INTEGER,
  week            INTEGER,
  created_ms      INTEGER,
  team_count      INTEGER,
  roster_ids_json TEXT,
  is_offseason    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_trade_family_season ON trade(family_id, season);

CREATE TABLE IF NOT EXISTS trade_asset (
  id                       INTEGER PRIMARY KEY,
  trade_id                 TEXT NOT NULL REFERENCES trade(id) ON DELETE CASCADE,
  asset_type               TEXT NOT NULL,   -- 'player' | 'pick' | 'faab'
  player_id                TEXT,
  pick_season              INTEGER,
  pick_round               INTEGER,
  pick_original_roster_id  INTEGER,
  faab_amount              INTEGER,
  from_roster_id           INTEGER,
  to_roster_id             INTEGER,
  from_user_id             TEXT,
  to_user_id               TEXT
);
CREATE INDEX IF NOT EXISTS idx_trade_asset_trade ON trade_asset(trade_id);

CREATE TABLE IF NOT EXISTS trade_asset_resolution (
  asset_id          INTEGER PRIMARY KEY REFERENCES trade_asset(id) ON DELETE CASCADE,
  resolved_player_id TEXT,
  resolved_draft_id  TEXT,
  resolved_pick_no   INTEGER,
  resolution_status  TEXT                   -- resolved | pending | retraded | void
);

CREATE TABLE IF NOT EXISTS trade_valuation (
  trade_id                 TEXT NOT NULL REFERENCES trade(id) ON DELETE CASCADE,
  user_id                  TEXT NOT NULL,
  points_rostered          REAL,
  points_started           REAL,
  points_above_replacement REAL,
  weeks_held               INTEGER,
  assets_still_rostered    INTEGER,
  assets_received          INTEGER,
  computed_at              INTEGER,
  PRIMARY KEY (trade_id, user_id)
);

CREATE TABLE IF NOT EXISTS draft_pick (
  draft_id  TEXT NOT NULL,
  pick_no   INTEGER NOT NULL,
  league_id TEXT REFERENCES league_season(league_id) ON DELETE CASCADE,
  season    INTEGER,
  round     INTEGER,
  roster_id INTEGER,
  user_id   TEXT,
  player_id TEXT,
  is_keeper INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (draft_id, pick_no)
);
CREATE INDEX IF NOT EXISTS idx_draft_pick_league ON draft_pick(league_id);
CREATE INDEX IF NOT EXISTS idx_draft_pick_player ON draft_pick(player_id);

-- Auto-computed season awards (PLAN.md §12.5). Trophy case on manager profiles.
CREATE TABLE IF NOT EXISTS award (
  id         INTEGER PRIMARY KEY,
  family_id  INTEGER NOT NULL REFERENCES league_family(id) ON DELETE CASCADE,
  league_id  TEXT REFERENCES league_season(league_id) ON DELETE CASCADE,
  season     INTEGER NOT NULL,
  award_type TEXT NOT NULL,                 -- 'champion' | 'mvp' | 'best_trade' | ...
  user_id    TEXT,
  detail_json TEXT,
  UNIQUE (family_id, season, award_type, user_id)
);

-- Global player dictionary, refreshed once daily from /players/nfl.
CREATE TABLE IF NOT EXISTS player (
  player_id  TEXT PRIMARY KEY,
  full_name  TEXT,
  position   TEXT,
  team       TEXT,
  age        INTEGER,
  years_exp  INTEGER,
  status     TEXT,
  updated_at INTEGER
);

-- Sync bookkeeping — makes backfill resumable (PLAN.md §2, §5 Phase 2).
CREATE TABLE IF NOT EXISTS sync_log (
  id              INTEGER PRIMARY KEY,
  league_id       TEXT,
  scope           TEXT,                     -- 'chain' | 'season' | 'week' | 'players' | ...
  cursor          TEXT,                     -- resume marker, e.g. "2021:week:7"
  started_at      INTEGER,
  finished_at     INTEGER,
  status          TEXT,                     -- 'running' | 'ok' | 'error'
  error           TEXT,
  records_written INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sync_log_league_scope ON sync_log(league_id, scope);

-- Small key/value store for sync state that isn't worth its own table
-- (e.g. last players refresh timestamp).
CREATE TABLE IF NOT EXISTS kv (
  key   TEXT PRIMARY KEY,
  value TEXT
);
