-- Weekly taxi / IR membership.
--
-- Sleeper's API only ever exposes a roster's *current* taxi and reserve lists,
-- and it logs neither a taxi activation nor an IR move as a transaction, so
-- there is no way to recover "who was on taxi in week 3" after the fact. This
-- table is the record we keep for ourselves: while a week is in progress the
-- incremental sync writes that week's lists down (source='snapshot'), and once
-- the week is final the snapshot is never overwritten.
--
-- For a current season's weeks that were already final before this table
-- existed, the sync writes today's taxi lists into them with
-- source='inferred'. Under the SDFF bylaws that is exact rather than a guess:
-- taxi locks before the week 1 kickoff, nobody may be added during the season,
-- and a player leaves taxi only by being activated — so anyone on taxi now was
-- on taxi every week of this season. The one case it gets wrong is a player
-- activated mid-season, who will look like he was never on taxi. IR is not
-- inferred at all: it changes freely all season, and it only drives a badge
-- (an IR player counts toward Max PF either way).
--
-- Taxi inference only runs for leagues that have a taxi squad at all
-- (capabilities.hasTaxiSquad).

CREATE TABLE IF NOT EXISTS roster_week_status (
  league_id TEXT NOT NULL REFERENCES league_season(league_id) ON DELETE CASCADE,
  week      INTEGER NOT NULL,
  roster_id INTEGER NOT NULL,
  player_id TEXT NOT NULL,
  status    TEXT NOT NULL,   -- 'taxi' | 'ir'
  source    TEXT NOT NULL,   -- 'snapshot' | 'inferred'
  PRIMARY KEY (league_id, week, player_id)
);

CREATE INDEX IF NOT EXISTS idx_roster_week_status_week
  ON roster_week_status(league_id, week, status);
