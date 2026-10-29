-- KeepTradeCut dynasty values, stored daily so a trade can be judged against
-- what its assets were worth on the day it was made.
--
-- Why SQLite and not the file cache: a value-at-trade is history. The file
-- cache already holds today's KTC rankings for the draft tool (live, volatile,
-- 1h TTL); these rows are the permanent record behind them.
--
-- `ktc_asset` is KTC's own universe — exactly 500 entries at the time of
-- writing, 464 players plus 36 rookie-draft picks (position 'RDP'). Anyone
-- outside KTC's top 500 simply has no value, which is why `player_id` is
-- nullable in both directions: a KTC entry we could not match to Sleeper, and a
-- Sleeper player with no KTC entry at all, are both normal.
--
-- `ktc_value` holds plain **superflex** values, not TE-premium. KTC publishes
-- TEP history for tight ends only (77 of 500 entries), and its all-time
-- per-player series carries no TEP at all — so TEP "then" vs TEP "now" is not
-- available as an apples-to-apples pair. For every non-TE the two are identical
-- anyway. See server/ktc/client.ts.

CREATE TABLE IF NOT EXISTS ktc_asset (
  ktc_id       INTEGER PRIMARY KEY,   -- KTC's own playerID
  slug         TEXT NOT NULL,         -- URL slug, e.g. 'jahmyr-gibbs-1415'
  name         TEXT NOT NULL,
  position     TEXT NOT NULL,         -- QB | RB | WR | TE | RDP
  team         TEXT,
  pick_season  INTEGER,               -- RDP only
  pick_round   INTEGER,               -- RDP only
  pick_tier    TEXT,                  -- RDP only: 'early' | 'mid' | 'late'
  player_id    TEXT,                  -- mapped Sleeper player_id, nullable
  match_source TEXT,                  -- 'auto' | 'manual'
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ktc_asset_player ON ktc_asset(player_id);
CREATE INDEX IF NOT EXISTS idx_ktc_asset_pick
  ON ktc_asset(pick_season, pick_round, pick_tier);

-- One row per asset per day. `rank` is only known on days we took a live
-- snapshot — the history feeds carry values without ranks.
CREATE TABLE IF NOT EXISTS ktc_value (
  ktc_id INTEGER NOT NULL REFERENCES ktc_asset(ktc_id) ON DELETE CASCADE,
  date   TEXT NOT NULL,               -- 'YYYY-MM-DD', America/New_York
  value  INTEGER NOT NULL,
  rank   INTEGER,
  PRIMARY KEY (ktc_id, date)
);
CREATE INDEX IF NOT EXISTS idx_ktc_value_date ON ktc_value(date);

-- Escape hatch for a player KTC and Sleeper spell differently enough that
-- normalized name + position cannot bridge it. Hand-maintained; wins over the
-- automatic match.
CREATE TABLE IF NOT EXISTS ktc_match_override (
  player_id TEXT PRIMARY KEY,
  ktc_id    INTEGER NOT NULL
);
