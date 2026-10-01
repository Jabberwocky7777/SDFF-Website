-- Week finality.
--
-- The incremental sync stores the week in progress too (live scores for the
-- Matchups scoreboard), but nothing that reads history should count a game
-- that hasn't finished. `is_final` is set at ingest from the NFL calendar: a
-- week is final once the Tuesday morning after its Monday-night game has
-- passed (server/analytics/nflCalendar.ts). Every history query filters on it.
--
-- Existing rows default to final; the next incremental sync (one runs shortly
-- after boot) re-ingests the current season and flags its live week.

ALTER TABLE matchup ADD COLUMN is_final INTEGER NOT NULL DEFAULT 1;
ALTER TABLE player_week_roster ADD COLUMN is_final INTEGER NOT NULL DEFAULT 1;
