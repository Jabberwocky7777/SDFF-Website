-- Playoff brackets.
--
-- Sleeper's winners_bracket / losers_bracket were already being fetched every
-- sync, used to derive `is_playoff`, `team_season.final_rank` and the week
-- ceiling, and then thrown away. Keeping them lets the app actually draw a
-- bracket per season instead of only showing who ended up where.
--
-- Roster ids here are only meaningful within `league_id` — resolve them
-- through team_season for that same league, never across seasons.

CREATE TABLE IF NOT EXISTS playoff_bracket (
  league_id         TEXT NOT NULL REFERENCES league_season(league_id) ON DELETE CASCADE,
  bracket           TEXT NOT NULL,        -- 'winners' | 'losers'
  match_id          INTEGER NOT NULL,     -- Sleeper's `m`, unique within a bracket
  round             INTEGER NOT NULL,     -- Sleeper's `r`, 1-based
  t1_roster_id      INTEGER,              -- NULL until the feeding match resolves
  t2_roster_id      INTEGER,
  winner_roster_id  INTEGER,
  loser_roster_id   INTEGER,
  placement         INTEGER,              -- Sleeper's `p`: the place this match decides
  t1_from_json      TEXT,                 -- {w:|l: <match_id>} — which match feeds this slot
  t2_from_json      TEXT,
  PRIMARY KEY (league_id, bracket, match_id)
);

CREATE INDEX IF NOT EXISTS idx_playoff_bracket_round
  ON playoff_bracket (league_id, bracket, round, match_id);
