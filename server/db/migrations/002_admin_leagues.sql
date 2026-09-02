-- Move league identity + auth from a JSON file into the DB so the commissioner
-- manages everything from the in-app admin settings screen.

ALTER TABLE league_family ADD COLUMN access_code   TEXT NOT NULL DEFAULT '';
ALTER TABLE league_family ADD COLUMN theme_accent  TEXT;
ALTER TABLE league_family ADD COLUMN added_at      INTEGER;

-- Manager identity merges (a person with two Sleeper accounts across seasons).
-- Editable from the admin screen; consumed by the ingest via resolveManager().
CREATE TABLE IF NOT EXISTS manager_alias (
  alias_user_id     TEXT PRIMARY KEY,
  canonical_user_id TEXT NOT NULL,
  created_at        INTEGER
);

-- App-level settings live in the existing kv table:
--   kv['admin_pw']         scrypt "salt:hash" for the commissioner password
--   kv['sleeper_username'] default username for league discovery
--   kv['setup_at']         epoch ms the app was first configured
