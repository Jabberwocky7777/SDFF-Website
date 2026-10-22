-- Every slot a player is eligible for, not just his primary one.
--
-- `player.position` is Sleeper's single headline position, and for a handful of
-- players it is not the one that decides a lineup: Travis Hunter is listed
-- `position = 'DB'` with `fantasy_positions = ['WR','DB']`, and Sleeper's own
-- Max PF duly starts him at WR. Using the primary position alone cost SDFF
-- roster 11 exactly 9.70 points of week-6 Max PF against Sleeper's `ppts`,
-- which is how this was found.
--
-- Stored as the raw JSON array. NULL until the next players refresh, and
-- optimalLineup falls back to `position` for those rows, so an un-refreshed
-- database keeps behaving exactly as it did before.

ALTER TABLE player ADD COLUMN fantasy_positions_json TEXT;
