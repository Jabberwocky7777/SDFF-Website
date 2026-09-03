-- 003: data-quality flagging for matchups + per-season player scoring ranks.
--
-- `matchup.data_quality` marks games whose source scores are unrecoverable.
-- Sleeper occasionally returns a week with placeholder starter slots ("0") and
-- zeroed players_points; those rows still carry a W/L the league played by, but
-- their scores and margins are meaningless. NULL = trustworthy.
--
-- `player_season_scoring` holds each NFL player's season total under a specific
-- league family's scoring settings, plus his rank within his position. It is
-- derived (from /stats/nfl/regular/:season x scoring_settings_json) and can be
-- rebuilt from scratch at any time.

ALTER TABLE matchup ADD COLUMN data_quality TEXT;

CREATE TABLE IF NOT EXISTS player_season_scoring (
  family_id INTEGER NOT NULL REFERENCES league_family(id) ON DELETE CASCADE,
  season    INTEGER NOT NULL,
  player_id TEXT    NOT NULL,
  position  TEXT,
  points    REAL    NOT NULL,
  pos_rank  INTEGER NOT NULL,
  games     INTEGER,
  PRIMARY KEY (family_id, season, player_id)
);

CREATE INDEX IF NOT EXISTS idx_pss_rank
  ON player_season_scoring(family_id, season, position, pos_rank);
