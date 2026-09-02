# SDFF → Multi-League Fantasy Hub: Implementation Plan

**Target repo:** `Jabberwocky7777/SDFF-Website`
**Goal:** Expand the single-league SDFF dynasty site into a multi-league hub with deep historical analytics and in-season weekly insight.

---

## 0. Read this first (context for Claude Code)

### Current state (as of the README)

- **Frontend:** React 19 + Vite + TypeScript + Tailwind
- **Backend:** Express 5 (Node 20), acts as a caching proxy in front of the Sleeper API
- **Auth:** HTTP Basic Auth, single `SITE_PASSWORD` env var
- **Cache:** file-based JSON, per-route TTLs, stale fallback
- **Deploy:** Docker → ghcr.io → TrueNAS Scale, port 3001 behind a reverse proxy
- **Config:** a single `LEAGUE_ID` env var
- **Pages:** Dashboard, Standings, Rosters, Timeline, Bylaws

### The core architectural problem

The app today is a **live pass-through proxy**. That works fine for "show me current standings." It completely falls over for what we now want:

> "Career head-to-head record between Manager A and Manager B across 6 seasons and 3 leagues."

That question requires every matchup from every week of every season, joined against a stable manager identity, aggregated. You cannot compute that by proxying a request. It needs to be **ingested once and stored**.

**So the single biggest change in this plan is splitting the backend into two layers:**

| Layer | Job | Storage |
|---|---|---|
| **Sync/ingest** | Walk the Sleeper API, normalize, persist history | SQLite |
| **Read API** | Query SQLite for analytics; proxy Sleeper live for current-week data | SQLite + existing file cache |

Keep the existing file cache for volatile live data (current week matchups, trending players). Add SQLite for everything historical and computed.

### Non-negotiable constraints

- Do **not** break the existing single-league deployment during migration. Each phase should leave `main` deployable.
- Sleeper's API is read-only, unauthenticated, and asks clients to stay **under ~1000 requests/minute**. Backfill must be rate-limited and resumable.
- The site is publicly reachable. Password gate must actually hold up (see Phase 6).

---

## 1. Sleeper API reference (the endpoints this plan depends on)

Base: `https://api.sleeper.app/v1`

| Endpoint | Use |
|---|---|
| `GET /state/nfl` | Current season, current week, season type. Drives "what week is it" everywhere. |
| `GET /user/{username_or_id}` | Resolve your username → stable `user_id` |
| `GET /user/{user_id}/leagues/nfl/{season}` | **League discovery** — enumerate all your leagues for a season |
| `GET /league/{league_id}` | League meta: `name`, `season`, `status`, `settings`, `scoring_settings`, `roster_positions`, and critically **`previous_league_id`** |
| `GET /league/{league_id}/rosters` | `roster_id`, `owner_id`, `co_owners`, `settings` (wins/losses/fpts/fpts_against), `players`, `starters` |
| `GET /league/{league_id}/users` | `user_id`, `display_name`, `avatar`, `metadata.team_name` |
| `GET /league/{league_id}/matchups/{week}` | Per-roster: `matchup_id`, `points`, `starters`, `starters_points`, `players`, `players_points` |
| `GET /league/{league_id}/winners_bracket` | Championship bracket — needed to determine actual final placement |
| `GET /league/{league_id}/losers_bracket` | Consolation bracket |
| `GET /league/{league_id}/transactions/{week}` | Trades, waivers, FAAB bids, free agent adds |
| `GET /league/{league_id}/traded_picks` | Dynasty pick trading |
| `GET /league/{league_id}/drafts` → `GET /draft/{draft_id}/picks` | Draft history |
| `GET /players/nfl` | ~5MB player dictionary. **Fetch once per day, globally, shared across all leagues.** Never per-request. |

Avatars: `https://sleepercdn.com/avatars/thumbs/{avatar_id}`

### The `previous_league_id` chain — this is the key to league history

Sleeper does not have a "give me league history" endpoint. Instead, each season's league object points backward to the prior season's league:

```
2026 league ──previous_league_id──> 2025 league ──> 2024 league ──> ... ──> null
```

**Ingest strategy:** for each league family, you are given only the *current* league ID. Walk `previous_league_id` backward until null, collecting every season's league ID. That chain **is** the league's history. Store it as a `league_family` with N `league_seasons`.

Write this walker first. Everything else depends on it.

---

## 2. Data model (SQLite)

Use `better-sqlite3` (synchronous, fast, zero-config, ideal for this). Store the DB file in the existing mounted cache dataset so it survives container restarts and gets picked up by TrueNAS snapshots.

```sql
-- A league across all its seasons (the previous_league_id chain)
league_family (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE,           -- 'sdff', 'redraft-2026', used in URLs
  display_name TEXT,
  league_type TEXT,           -- 'dynasty' | 'redraft' | 'keeper' | 'bestball'
  current_league_id TEXT,     -- the Sleeper ID for the newest season
  sort_order INTEGER
)

league_season (
  league_id TEXT PRIMARY KEY, -- Sleeper league_id
  family_id INTEGER REFERENCES league_family(id),
  season INTEGER,
  status TEXT,                -- pre_draft | drafting | in_season | complete
  previous_league_id TEXT,
  total_rosters INTEGER,
  playoff_week_start INTEGER,
  playoff_teams INTEGER,
  scoring_settings_json TEXT,
  roster_positions_json TEXT,
  settings_json TEXT,
  raw_json TEXT
)

-- Global manager identity, shared ACROSS leagues. This is what makes
-- cross-league manager profiles possible.
manager (
  user_id TEXT PRIMARY KEY,   -- Sleeper user_id, stable forever
  display_name TEXT,
  avatar TEXT,
  canonical_name TEXT,        -- manual override for display
  alias_of TEXT REFERENCES manager(user_id)  -- for account changes; see gotchas
)

-- A manager's team within one league-season
team_season (
  league_id TEXT,
  roster_id INTEGER,
  user_id TEXT REFERENCES manager(user_id),
  co_owner_ids_json TEXT,
  team_name TEXT,
  wins INTEGER, losses INTEGER, ties INTEGER,
  points_for REAL, points_against REAL,
  division INTEGER,
  regular_season_rank INTEGER,
  final_rank INTEGER,         -- derived from brackets, NOT from Sleeper directly
  PRIMARY KEY (league_id, roster_id)
)

-- One row per team per week. The atomic unit of nearly every stat.
matchup (
  league_id TEXT,
  week INTEGER,
  matchup_id INTEGER,         -- NULL for bye/orphan weeks
  roster_id INTEGER,
  user_id TEXT,
  points REAL,
  opponent_roster_id INTEGER,
  opponent_user_id TEXT,
  opponent_points REAL,
  result TEXT,                -- 'W' | 'L' | 'T'
  is_playoff BOOLEAN,
  is_consolation BOOLEAN,
  starters_json TEXT,
  starters_points_json TEXT,
  players_json TEXT,
  players_points_json TEXT,
  optimal_points REAL,        -- computed, see Phase 4
  PRIMARY KEY (league_id, week, roster_id)
)

transaction_record (
  id TEXT PRIMARY KEY, league_id TEXT, week INTEGER, type TEXT,
  status TEXT, created_ms INTEGER, roster_ids_json TEXT,
  adds_json TEXT, drops_json TEXT, draft_picks_json TEXT,
  waiver_bid INTEGER, raw_json TEXT
)

draft_pick (
  draft_id TEXT, pick_no INTEGER, league_id TEXT, season INTEGER,
  round INTEGER, roster_id INTEGER, user_id TEXT,
  player_id TEXT, is_keeper BOOLEAN,
  PRIMARY KEY (draft_id, pick_no)
)

player (                      -- refreshed daily from /players/nfl
  player_id TEXT PRIMARY KEY,
  full_name TEXT, position TEXT, team TEXT,
  age INTEGER, years_exp INTEGER, status TEXT,
  updated_at INTEGER
)

sync_log (
  id INTEGER PRIMARY KEY, league_id TEXT, scope TEXT,
  started_at INTEGER, finished_at INTEGER,
  status TEXT, error TEXT, records_written INTEGER
)
```

**Indexes to add:** `matchup(user_id)`, `matchup(league_id, week)`, `matchup(opponent_user_id)`, `team_season(user_id)`, `league_season(family_id, season)`.

---

## 3. League configuration

Replace the single `LEAGUE_ID` env var with a config file. Do **not** hardcode league IDs in source.

`config/leagues.json`:
```json
{
  "leagues": [
    {
      "slug": "sdff",
      "displayName": "Squad Dynasty Fantasy Football",
      "currentLeagueId": "XXXXXXXXXXXXXXXXXX",
      "type": "dynasty",
      "sortOrder": 1,
      "theme": { "accent": "#7c3aed" }
    },
    {
      "slug": "the-redraft",
      "displayName": "Redraft League Name",
      "currentLeagueId": "YYYYYYYYYYYYYYYYYY",
      "type": "redraft",
      "sortOrder": 2,
      "theme": { "accent": "#059669" }
    }
  ],
  "managerAliases": {},
  "displayNameOverrides": {}
}
```

Mount this as a volume in `docker-compose.yml` so leagues can be added without rebuilding the image.

**Keep backward compat:** if `LEAGUE_ID` is set and `config/leagues.json` is absent, synthesize a one-league config from the env var. This keeps the current deployment alive through the migration.

**Also add a discovery CLI:** `npm run leagues:discover -- --username <your_sleeper_username>` which hits `/user/{username}/leagues/nfl/{season}` and prints every league you're in with its ID, so you can paste them into the config instead of hunting through the Sleeper app.

---

## 4. Analytics to compute

This is the actual product. Split into two buckets.

### 4A. Historical / all-time (computed from SQLite after backfill)

**All-time standings** — per manager, per league family, and combined across all leagues: W-L-T, win %, PF, PA, PPG, seasons played, playoff appearances, championships, last-place finishes.

**Career head-to-head matrix** — the marquee feature. An N×N grid of every manager vs every other manager: record, avg margin, largest win, current streak, playoff-only record. Clicking a cell opens the full game log of every meeting.

**Records book** — highest single-week score, lowest, biggest blowout margin, closest finish, highest-scoring loss, lowest-scoring win, longest win streak, longest losing streak, best/worst season by PPG, highest combined matchup score.

**Season-by-season timeline** — a table with one row per season, one column per manager, cells showing final rank. Champion cells highlighted. Instantly readable league history.

**Luck & all-play metrics** — the differentiator most sites skip:
- **All-play record:** each week, compare a team's score against *every other* team's score that week. Gives a schedule-independent measure of strength.
- **Schedule luck:** actual wins − all-play expected wins. Positive = lucky schedule.
- **Points-above-median** per week.
- **Expected wins** from a team's own score distribution.

**Coaching efficiency** — computed optimal lineup (best legal starter set given `roster_positions` and actual `players_points`) vs. what they actually started. Yields "points left on bench" — season and career leaderboards. Note: this is only approximate for weeks where a player was on bye or inactive, so flag it as such.

**Draft history** — every pick every year, with hit/miss framing (e.g. career points scored while rostered, or simple positional rank in the following season).

**Trade ledger & trade tree** — every trade, who won it in hindsight, and for dynasty, follow traded picks forward to the player they became.

**Manager profile page** — one page per manager pulling across *all* leagues they're in: aggregate record, per-league breakdown, best/worst seasons, favorite/nemesis opponents, draft tendencies, trade count.

### 4B. In-season weekly (refreshed during the season)

**Power rankings** — blended score: recent form (last 3 weeks), season PPG, all-play win %, and roster strength. Show week-over-week movement arrows.

**Auto-generated weekly recap** — a templated narrative: highest scorer, biggest blowout, closest game, worst start/sit decision, biggest bench-points burn, notable waiver moves, upset of the week. This is generatable from pure data with string templates — no LLM required, though see the optional idea in §8.

**Matchup previews** — for each of the coming week's matchups: head-to-head career record, both teams' recent form, projected margin, rivalry callouts ("Manager A has lost 4 straight to Manager B").

**Playoff odds** — Monte Carlo. Simulate the remaining schedule 10,000 times, sampling each team's weekly score from its own historical distribution (mean + stddev of that team's scores). Output: playoff %, bye %, title %, projected seed. Recompute nightly, not per-request.

**Live scoreboard** — current week matchups with live points, plus win probability. This stays on the file-cache proxy path with a short TTL (60–120s during games).

**Transaction feed** — recent waivers/FAAB/trades across all leagues in one stream.

---

## 5. Implementation phases

Each phase should be a separate PR, each leaving `main` deployable.

### Phase 1 — Foundation & data layer
- [ ] Add `better-sqlite3`, create `server/db/schema.sql` and a migration runner
- [ ] Build `server/sleeper/client.ts`: typed Sleeper client with rate limiting (token bucket, ~10 req/s ceiling), retry with exponential backoff, and 429/5xx handling
- [ ] Build the `previous_league_id` chain walker
- [ ] Build `config/leagues.json` loader with Zod validation + `LEAGUE_ID` backward-compat shim
- [ ] `npm run leagues:discover` CLI
- [ ] **Acceptance:** run the walker on the SDFF league ID and print every historical season it finds

### Phase 2 — Backfill / ingest
- [ ] `npm run sync:backfill -- --league <slug|all>` — full historical pull
- [ ] `npm run sync:incremental` — current week + live data only
- [ ] Idempotent upserts (safe to re-run), resumable via `sync_log`
- [ ] Daily `/players/nfl` refresh, stored once globally
- [ ] Derive `final_rank` from `winners_bracket` + `losers_bracket`
- [ ] Node-cron scheduler in the server process: incremental hourly Tue–Sun in season, every 5 min during Sunday game windows, daily otherwise
- [ ] **Acceptance:** SDFF's full history in SQLite; `SELECT COUNT(*) FROM matchup` matches expected seasons × weeks × teams

### Phase 3 — API restructure
- [ ] Namespace all routes under `/api/leagues/:slug/...`
- [ ] `GET /api/leagues` — list configured leagues
- [ ] `GET /api/leagues/:slug/{standings,rosters,history,records,h2h,matchups/:week}`
- [ ] `GET /api/managers` and `GET /api/managers/:userId` (cross-league)
- [ ] Keep old unprefixed routes as deprecated aliases → default league, so nothing breaks mid-migration
- [ ] Analytics query modules in `server/analytics/` — pure functions over SQLite, unit-testable
- [ ] **Acceptance:** every legacy frontend call still works; new namespaced routes return correct data

### Phase 4 — Analytics engine
- [ ] `all-play.ts`, `h2h.ts`, `records.ts`, `optimal-lineup.ts`, `power-rankings.ts`, `playoff-odds.ts`
- [ ] Optimal lineup solver must respect FLEX/SUPERFLEX slot eligibility from `roster_positions`
- [ ] Materialize expensive aggregates into summary tables on sync rather than computing per-request
- [ ] **Unit tests with fixture data for every one of these.** Stats math that's silently wrong is worse than no stats.
- [ ] **Acceptance:** hand-verify a few H2H records and the all-time standings against Sleeper's own UI

### Phase 5 — Frontend
- [ ] League switcher in the header (persist selection in localStorage; league slug in the URL)
- [ ] Route restructure: `/:leagueSlug/*`, plus global `/managers/:id` and a cross-league `/` home
- [ ] New pages: **History**, **Head-to-Head** (interactive matrix), **Records**, **Manager Profile**, **Draft History**, **Trades**, **Power Rankings**, **Playoff Odds**, **Weekly Recap**
- [ ] Per-league accent theming from config
- [ ] Loading skeletons + error boundaries on every data page
- [ ] Data freshness indicator ("Updated 4 minutes ago")
- [ ] Mobile-first pass — this will mostly be read on phones during games
- [ ] **Acceptance:** existing SDFF pages look and behave the same, now nested under the league slug

### Phase 6 — Security hardening
See §6 below.

### Phase 7 — Polish & ops
- [ ] Admin page: sync status, last run per league, manual re-sync trigger, error log
- [ ] Nightly SQLite backup (`VACUUM INTO` a timestamped file in the cache dataset)
- [ ] `robots.txt` with `Disallow: /` and a `noindex` meta tag
- [ ] Structured logging (pino)
- [ ] Update README for the multi-league setup

---

## 6. Security

Your current setup is HTTP Basic Auth with a plaintext `SITE_PASSWORD`. For a public URL that's the weakest link. Recommended upgrades, roughly in priority order:

1. **Replace Basic Auth with a signed-cookie session.** A single login page, one shared password, an `httpOnly` + `Secure` + `SameSite=Lax` cookie signed with a `SESSION_SECRET`. Benefits: real logout, no credentials re-sent on every request, and a login page you can style instead of a browser popup.

2. **Store a hash, not the password.** Put `SITE_PASSWORD_HASH` (scrypt or bcrypt) in the env instead of the plaintext. Add a `npm run hash-password` helper.

3. **Rate-limit the login endpoint.** `express-rate-limit`, ~5 attempts per 15 min per IP. Without this, a public password gate is brute-forceable in an afternoon.

4. **Audit the dev Basic Auth injection.** The README says the Vite dev proxy injects auth headers automatically. Verify that path is strictly `import.meta.env.DEV`-gated and that no credential can ever land in the production bundle. Grep the built `dist/` for the password string as a test.

5. **`helmet`** for security headers + a Content-Security-Policy.

6. **Lock down CORS** to the actual production origin. Currently it's opened when `NODE_ENV=development` — make sure production is genuinely closed.

7. **Never trust the client for league access.** Enforce the allowed-leagues list server-side; don't let `/api/leagues/:slug/...` fetch an arbitrary Sleeper league ID passed by the client. Validate `:slug` against the config on every request.

8. **Optional, later:** per-user accounts so each leaguemate gets their own login, which unlocks "your team" personalization and per-league access control. Overkill for v1 — the shared password is fine to start.

Also: since the site is public but private-by-password, make sure your reverse proxy terminates TLS and redirects HTTP→HTTPS, and consider fail2ban on repeated 401s.

---

## 7. Gotchas Claude Code should handle explicitly

These will bite during backfill. Call them out in the code as comments.

- **Manager identity changes.** If someone deletes and recreates their Sleeper account, or a team changes hands mid-history, `user_id` changes. Hence the `alias_of` column and the `managerAliases` config map. Provide a CLI to merge two manager IDs.
- **Orphan teams.** A roster with `owner_id: null` (commissioner-managed). Don't crash; attribute to a synthetic "Orphan Team" manager.
- **Co-owners.** `roster.co_owners` is an array. Decide whether co-owners get credit in H2H records (recommendation: primary owner only for records, but show co-owners on the team page).
- **`points` can be null** for very old seasons or weeks that never happened. Filter, don't sum nulls into NaN.
- **Playoff vs consolation.** The matchups endpoint returns rows for playoff weeks too, but you need the brackets to know which games are real playoff games versus consolation. Don't let a 7th-place game count as a playoff win.
- **Median scoring leagues.** Some leagues award an extra win for beating the weekly median (`settings.league_average_match`). This affects W-L math. Detect and handle.
- **Different scoring across leagues.** Never compare raw point totals between a PPR dynasty and a half-PPR redraft without labeling it. Cross-league leaderboards should normalize (z-score within league-season) or be clearly scoped.
- **Roster size / superflex differences** affect the optimal-lineup solver. Read `roster_positions` per league-season, don't assume.
- **Week counts changed.** The NFL went from 16 to 17 games in 2021; fantasy regular seasons and playoff start weeks shifted accordingly. Read `playoff_week_start` from settings rather than hardcoding.
- **Bye weeks in odd-team leagues.** A roster can have no `matchup_id`. Handle null.
- **The `/players/nfl` blob is huge.** Fetching it per request will be brutally slow and rude to Sleeper. Once daily, globally, into the `player` table.

---

## 8. Additional ideas worth considering

Things the site is missing or could add, beyond the core ask:

- **Weekly digest email or Discord/Slack webhook.** Auto-post the recap and power rankings Tuesday morning. Cheap to build once the recap generator exists, and it's what actually drives leaguemates back to the site.
- **"On this date in league history"** on the dashboard — a nice ambient touch for a dynasty league.
- **Rivalry pages.** Auto-detect the most-played and closest-record pairs and give them a dedicated page.
- **Season awards.** Auto-computed at season end: MVP (most points from a single player), best draft pick, worst start/sit, luckiest/unluckiest, best trade.
- **Dynasty-specific: roster age curves & contention windows.** You already have `ageTier` in `lib/`. Extend it into a "rebuild vs contend" view per team.
- **Trade tree visualization** for dynasty — follow a traded pick through to the player it became and everything that player was later traded for.
- **LLM-generated recaps (optional).** You already know the Anthropic API. Feed the week's structured data into a prompt and get a genuinely funny recap in a chosen voice. Keep the deterministic template version as a fallback and cache the generated text so you're not paying per pageview.
- **A public read-only mode** for a single "brag page" (all-time standings, championships) if you ever want to share without handing out the password.
- **Testing.** The repo currently has no visible test setup. Add Vitest and, at minimum, cover the analytics functions. Stat bugs erode trust in the whole site instantly.
- **CI.** You already have GitHub Actions for the Docker build; add lint + typecheck + test as gates before the image publishes.

---

## 9. Suggested `CLAUDE.md` for the repo

Add this to the repo root so Claude Code has persistent context:

```markdown
# CLAUDE.md

## Project
Multi-league fantasy football hub built on the Sleeper API. React 19 + Vite +
TypeScript frontend, Express 5 backend, SQLite for historical data, file cache
for live data. Deployed via Docker to TrueNAS Scale.

## Architecture rules
- Historical/computed data → SQLite. Live/volatile data → file cache proxy.
- Never call the Sleeper API from the frontend. All Sleeper access goes through
  the server.
- Never fetch /players/nfl outside the daily sync job.
- League IDs come from config/leagues.json only. Never hardcode. Always validate
  a request's :slug against the config before touching Sleeper.
- Analytics live in server/analytics/ as pure functions over query results, so
  they can be unit-tested without a network or DB.

## Commands
npm run dev            # Vite frontend
npm run dev:server     # Express backend
npm run build:all      # Build frontend + compile server
npm run sync:backfill  # Full historical ingest
npm run sync:incremental
npm run leagues:discover
npm test               # Vitest

## Conventions
- Strict TypeScript. No `any` in analytics code.
- Zod-validate every external API response at the boundary.
- Every new analytics function needs a unit test with fixture data.
- Money/points as numbers, never strings. Guard against null `points`.
```

---

## 10. Kickoff prompt for Claude Code

Paste this to start:

> Read `PLAN.md` in the repo root. We're expanding this single-league Sleeper
> fantasy site into a multi-league hub with historical analytics.
>
> Start with **Phase 1 only**. Before writing code, explore the existing
> `server/` and `src/` directories and tell me:
> 1. How the current cache layer and route structure actually work
> 2. Anything in the plan that conflicts with what's already there
> 3. Your proposed file layout for the new data layer
>
> Then implement Phase 1 and stop. Don't start Phase 2 until I confirm.

---

## Open questions for you to answer before starting

1. **How many leagues, and what types?** (dynasty / redraft / keeper / best ball — each has different history semantics)
2. **How far back does each league go?** Determines backfill volume.
3. **Have any managers changed Sleeper accounts** over the league's history? If so, you'll need the alias map populated up front.
4. **Should leagues be fully separate, or is a combined cross-league view (manager profiles, "who's the best manager across all leagues") a first-class feature?** The plan assumes yes on cross-league, which is why `manager` is a global table.
5. **Is a shared password sufficient, or do you eventually want per-leaguemate logins?** Affects whether to build the session layer with future user accounts in mind.

---

## 11. League switching & handling different league types

Switching leagues should feel instant and should never dead-end the user. Three rules make that happen.

### 11.1 League lives in the URL, and switching preserves the sub-route

```
/                          → cross-league home (all leagues, all managers)
/:leagueSlug               → that league's dashboard
/:leagueSlug/standings
/:leagueSlug/history
/:leagueSlug/head-to-head
/:leagueSlug/records
/:leagueSlug/rosters
/:leagueSlug/draft
/:leagueSlug/trades
/:leagueSlug/power-rankings
/:leagueSlug/playoff-odds
/:leagueSlug/week/:week     → weekly recap / scoreboard
/managers                   → global, all leagues
/managers/:userId           → global manager profile
/managers/:userIdA/vs/:userIdB → global cross-league H2H
```

**Switcher behavior:** when the user picks a different league, swap only the slug
segment and keep the rest of the path. On `/sdff/head-to-head` → switching to
`redraft` lands on `/redraft/head-to-head`, not back at a dashboard.

**Fallback:** if the target league doesn't support the current view (per §11.2),
redirect to that league's dashboard and show a small toast explaining why
("Draft pick trading isn't enabled in this league").

**Implementation notes:**
- Put league slug in every React Query key: `['standings', leagueSlug]`. Without
  this you get stale cross-league data flashing on switch.
- Persist last-selected league in localStorage; use it to redirect bare `/` visits
  for returning users.
- Prefetch the target league's dashboard data on switcher hover.
- Validate `:leagueSlug` against config on both client and server. Unknown slug →
  404 page, never a Sleeper API call.

### 11.2 Capability flags, not league-type conditionals

Do **not** write `if (league.type === 'dynasty')` in components. Derive a
capability object per league-season during sync and store it on `league_season`:

```ts
type LeagueCapabilities = {
  seasonsAvailable: number;      // length of previous_league_id chain
  hasHistory: boolean;           // seasonsAvailable > 1
  hasTradedPicks: boolean;       // /traded_picks non-empty
  hasRookieDraft: boolean;       // draft type/settings indicate rookie draft
  isKeeper: boolean;
  isBestBall: boolean;           // settings.best_ball
  isSuperflex: boolean;          // roster_positions includes SUPER_FLEX
  hasMedianScoring: boolean;     // settings.league_average_match
  hasDivisions: boolean;         // settings.divisions > 0
  hasTaxiSquad: boolean;         // settings.taxi_slots > 0
  playoffTeams: number;
  playoffWeekStart: number;
};
```

Nav and page availability are computed from these:

| View | Requires |
|---|---|
| History / Season Timeline | `hasHistory` |
| Head-to-Head matrix | always (empty state if `!hasHistory`) |
| Records book | always (thin if single season) |
| Coaching efficiency / bench points | `!isBestBall` |
| Draft history | always |
| Traded picks / trade tree | `hasTradedPicks` |
| Roster age curves / contention window | `isKeeper \|\| hasTradedPicks` (i.e. rosters persist) |
| Playoff odds | `status === 'in_season'` |
| Power rankings | at least 2 weeks played |

**Best-ball is the sharpest edge case:** there are no start/sit decisions, so
optimal-lineup, coaching efficiency, and "points left on bench" are all
meaningless. Hide them rather than showing zeros.

### 11.3 Empty and thin states are a first-class requirement

A brand-new redraft league has one season and possibly zero weeks played. Every
analytics view needs a designed empty state, not a crash or an empty table:

- H2H matrix, no games: show the manager roster with "first matchups week 1"
- Records book, one season: label it "2026 records" rather than "all-time"
- Power rankings, week 1: fall back to draft-based or preseason ordering
- Playoff odds, preseason: show even odds or suppress the view

**Acceptance test for this phase:** add a fake second league with a single season
to the config, click through every nav item, and confirm nothing throws and
nothing shows a misleading "all-time" label.

---

## 12. Expanded stats catalog (the fun stuff)

Grouped by what they need. Everything here is computable from the `matchup`,
`team_season`, `transaction_record`, and `draft_pick` tables.

### 12.1 Head-to-head — three scopes

Build the H2H engine once, parameterized by scope:

1. **Within a league family** — career record across all that league's seasons
2. **Within a single season** — for in-season matchup previews
3. **Across all leagues** — combined record for two managers who share multiple
   leagues, with a per-league breakdown underneath

For any manager pair, surface:
- Overall record + win %, and average margin of victory
- Regular season vs playoff splits (playoff wins should feel weightier)
- Largest blowout in each direction, and the closest game ever played
- Current streak and longest historical streak
- Full game log, sortable, one row per meeting
- Combined-scoring games (highest total points in a shared matchup)

**Cross-league caution:** combine *records* across leagues, never raw points.
Different scoring settings make point totals incomparable. If you want a
cross-league scoring comparison, z-score within each league-season first.

### 12.2 Nemesis & rivalry

- **Nemesis** — opponent a manager has the worst record against (min 4 meetings)
- **Favorite customer** — best record against
- **Rivalry index** — rank pairs by `games_played × closeness × stakes`, where
  closeness is the inverse of average margin and stakes weights playoff meetings.
  Auto-generate a page for the top rivalries.
- **"You cost me the playoffs"** — losses where flipping that single result would
  have changed the manager's final playoff position. Genuinely inflammatory in the
  best way.

### 12.3 Luck, pain, and injustice

The category that generates the most group-chat noise.

- **Schedule luck** — actual wins minus all-play expected wins
- **Highest-scoring loss** / **lowest-scoring win**, season and all-time
- **Decimal heartbreak** — games lost by under 1.00 points
- **Top-scorer losses** — weeks a manager posted a top-2 score league-wide and
  still lost
- **Ghost wins** — weeks a manager posted a bottom-2 score and won anyway
- **Best team to miss the playoffs** — highest PF non-qualifier, by season
- **Worst team to make the playoffs** — the inverse, equally fun
- **Would-have-beaten count** — for each loss, how many other teams that team
  would have beaten that week

### 12.4 Manager tendencies & profile badges

Per-manager, aggregated across all their leagues:

- **Boom/bust profile** — standard deviation of weekly scores; high-variance
  managers get a "Coin Flip" badge, low-variance get "Metronome"
- **Coaching efficiency** — career % of optimal lineup points captured
- **Bench burn leaderboard** — most points left on the bench, single week and career
- **Draft tendencies** — positional draft distribution, avg rookie-pick hit rate
- **Trade volume & trade win rate** — hindsight-scored
- **Waiver aggression** — FAAB spent per season, biggest single bid, bid win rate
- **Fast starter / slow starter** — first-half vs second-half win % splits
- **Playoff performer** — playoff win % vs regular season win %

Render the standout ones as badges on the profile page. Badges are cheap to build
and disproportionately fun.

### 12.5 Season awards (auto-computed at season end)

- Champion, runner-up, last place (with whatever punishment your bylaws specify)
- **MVP** — single player who scored the most points while started
- **Best draft pick** — largest gap between draft slot and end-of-season finish
- **Biggest bust** — the inverse
- **Best / worst trade** — hindsight point differential
- **Luckiest / unluckiest** — from §12.3
- **Best manager** — highest coaching efficiency
- **Game of the year** — closest game with the highest stakes

Store these in an `award` table so they can be shown on manager profiles as a
trophy case.

### 12.6 Ambient / dashboard touches

- **On this date in league history** — a matchup from this week in a prior season
- **Streak watch** — active win/loss streaks approaching league records
- **Record watch** — "Manager A is 12 points from the all-time single-week record"
- **This week's rivalry** — auto-flagged when a top-rivalry pair meets
- **Championship leverage** — how much each team's title odds swing on this
  week's result

### 12.7 Dynasty-specific (gated on capability flags)

- **Roster age curve** per team, with a contend/retool/rebuild classification
- **Contention window** projection
- **Trade tree** — follow a traded pick forward to the player it became, and
  everything that player was subsequently traded for
- **Pick value realized** — historical hit rate by rookie draft slot in your league

### 12.8 Build order recommendation

Ship in this order — earlier items are cheap and high-impact:

1. H2H matrix + game log (§12.1) — the marquee feature, build first
2. Records book (§12.3 partial) — pure SQL, very high fun-per-line-of-code
3. All-time standings + season timeline grid
4. Luck / all-play metrics (§12.3)
5. Manager profiles + badges (§12.4)
6. Nemesis & rivalry (§12.2)
7. Season awards (§12.5)
8. Dashboard ambient touches (§12.6)
9. Dynasty extras (§12.7)

---

## 13. Trade Tracker (dynasty)

Gated on the `hasTradedPicks` capability flag, but the player-attribution half
works for any league type.

### 13.1 The key insight: weekly rosters come free

`GET /league/{id}/matchups/{week}` returns `players`, `players_points`,
`starters`, and `starters_points` for every roster. That is a **complete weekly
roster snapshot with per-player scoring**, available for every historical week.

So you do **not** need to replay the transaction log to reconstruct who owned
whom when. Flatten the matchup JSON during sync into one derived table:

```sql
player_week_roster (
  league_id TEXT,
  season INTEGER,
  week INTEGER,
  player_id TEXT,
  roster_id INTEGER,
  user_id TEXT,
  points REAL,
  started BOOLEAN,
  PRIMARY KEY (league_id, week, player_id)
)
-- index: (player_id, league_id, week), (roster_id, week)
```

Sizing is a non-issue: 12 teams × ~28 players × 17 weeks × 8 seasons ≈ 45k rows
per league. SQLite will not notice.

This one table powers trade attribution, bench-points leaderboards, and coaching
efficiency. Build it in Phase 2 alongside the rest of the ingest.

**Attribution rule:** a player's points count toward the acquiring manager for
every week where `player_week_roster` shows that player on that manager's roster,
starting from the trade week. No date arithmetic, no tenure reconstruction, and
mid-week trades resolve themselves correctly. Attribution stops automatically
when the player is dropped or re-traded, because they stop appearing on that
roster.

**Known gap:** offseason weeks have no matchup rows, so a March trade accrues
nothing until week 1. That's correct behavior, but label it in the UI
("attribution begins Week 1").

### 13.2 Data model

```sql
trade (
  id TEXT PRIMARY KEY,          -- Sleeper transaction_id
  league_id TEXT,
  family_id INTEGER,
  season INTEGER,
  week INTEGER,
  created_ms INTEGER,
  team_count INTEGER,           -- 2, 3, or more
  roster_ids_json TEXT,
  is_offseason BOOLEAN
)

trade_asset (
  id INTEGER PRIMARY KEY,
  trade_id TEXT REFERENCES trade(id),
  asset_type TEXT,              -- 'player' | 'pick' | 'faab'
  player_id TEXT,               -- if player
  pick_season INTEGER,          -- if pick
  pick_round INTEGER,
  pick_original_roster_id INTEGER,
  faab_amount INTEGER,          -- if faab
  from_roster_id INTEGER,
  to_roster_id INTEGER,
  from_user_id TEXT,
  to_user_id TEXT
)

-- Resolves a traded pick into the player eventually selected with it
trade_asset_resolution (
  asset_id INTEGER REFERENCES trade_asset(id),
  resolved_player_id TEXT,
  resolved_draft_id TEXT,
  resolved_pick_no INTEGER,
  resolution_status TEXT        -- 'resolved' | 'pending' | 'retraded'
)

-- Recomputed on every sync; trades never stop updating in dynasty
trade_valuation (
  trade_id TEXT,
  user_id TEXT,
  points_rostered REAL,
  points_started REAL,
  points_above_replacement REAL,
  weeks_held INTEGER,
  assets_still_rostered INTEGER,
  assets_received INTEGER,
  computed_at INTEGER,
  PRIMARY KEY (trade_id, user_id)
)
```

**Build for N teams from day one.** `roster_ids` can have three or more entries.
Valuation is per-manager-per-trade, not a two-sided diff. Retrofitting three-way
trades later is genuinely painful.

Source data: `GET /league/{id}/transactions/{week}` where `type === 'trade'`.
Relevant fields are `adds` / `drops` (player_id → roster_id), `draft_picks`
(with `season`, `round`, `roster_id` = original owner, `previous_owner_id`,
`owner_id` = new owner), `waiver_budget` (FAAB transfers), and `created`.

Note: transactions are fetched per week, so backfill loops weeks 1..18 for each
season. Offseason trades appear in week 0 or week 1 depending on timing — pull
both and dedupe on `transaction_id`.

### 13.3 Valuation metrics — use several, not one

Raw points-since-trade is the obvious metric and it is misleading. Compute and
display all of these:

| Metric | What it measures | Notes |
|---|---|---|
| **Points rostered** | Total points scored while on the acquiring roster | Includes bench. Generous. |
| **Points started** | Points scored while in the starting lineup | **The honest headline number.** |
| **Points above replacement (PAR)** | Started points minus positional replacement level | Best single measure. See below. |
| **Weeks held** | Tenure | Contextualizes the above |
| **Still rostered** | Is the asset still there | Dynasty trades never fully close |
| **Win impact** | Games where the acquired assets' points changed the actual result | Expensive, high fun |

**Computing replacement level from your own league** (no external data needed):
for each position and season, replacement level = the average weekly points of
the *Nth* highest scorer at that position, where N = `total_rosters` × starting
slots at that position (read from `roster_positions`). Then
`PAR = sum(started_points − replacement_level_for_that_position_week)`.

This correctly reflects that 200 points from a QB in a 1QB league is
replacement-level while 200 from a TE is a league-winner. It also adapts
automatically to superflex leagues.

**FAAB** is hard to value objectively. Report the amount transferred; don't try
to convert it to points.

### 13.4 Draft pick resolution (the trade tree)

For each `trade_asset` of type `pick`:

1. Look up whether that pick's draft has happened. Match on
   `(season, round, original_roster_id)` against `traded_picks` and the
   `draft_pick` table to find the actual pick slot and the player selected.
2. If the pick was traded again before the draft, mark `resolution_status =
   'retraded'` — the asset's value for *this* trade is the pick as of the moment
   it left, and the downstream trade gets its own accounting.
3. If the draft hasn't happened, `resolution_status = 'pending'` and the trade
   shows as **unsettled** in the UI, with an estimated pick range based on the
   original team's current standing.
4. Once resolved, the selected player's points flow into the acquiring manager's
   valuation exactly like a traded player.

**Cap recursion depth at 2–3 levels.** A pick flipped four times produces a trade
page nobody can read. Show the direct resolution plus one level of "this pick
came from / became," with a link to explore further.

### 13.5 UI

**Trade feed** (`/:leagueSlug/trades`) — reverse-chronological, each card showing
the assets each side sent and received, the trade date, and a live running
differential. Filter by season, by manager, and by "unsettled" (picks pending).

**Trade detail page** (`/:leagueSlug/trades/:tradeId`) —
- Asset columns per team (N columns for N-team trades)
- A cumulative points-since-trade chart, one line per manager, updating weekly
- Per-asset breakdown table: points rostered, started, PAR, weeks held, current status
- Pick resolution: "2026 1st → became Player X"
- A verdict banner — see the caveat below

**On the manager profile** — trade count, aggregate trade differential, best and
worst trade, most frequent trade partner.

**Ambient** — trade anniversary callouts on the dashboard ("One year ago today,
Manager A traded…"), and a "trade of the year" season award.

### 13.6 Framing the verdict honestly

Show a differential and call it a **verdict, not a judgment.** Two things the
numbers genuinely cannot capture:

- A player who tore an ACL in week 3 makes a good-process trade look terrible.
  Variance is not the same as a bad decision.
- In dynasty, a trade made for a rebuild window may look lopsided for two years
  and then flip. Age and contention context matter.

Recommended UI copy near the verdict: a short note that these figures measure
outcome, not process, and that dynasty trades keep moving. Consider showing a
confidence indicator based on `weeks_held` and `assets_still_rostered` — a trade
from six weeks ago should not display the same certainty as one from 2021.

### 13.7 Edge cases to handle explicitly

- **Three-plus team trades** — per-manager accounting, N columns, no A-vs-B assumption
- **Player dropped shortly after acquisition** — attribution stops; surface
  "dropped after N weeks" rather than silently showing near-zero points
- **Player re-traded** — attribution stops for the original trade; link forward
- **Mid-week trades** — handled automatically by weekly roster membership; no
  special casing needed
- **Vetoed / failed trades** — check `status`; only ingest `complete` trades
- **Commissioner-forced roster moves** — may not appear in the transaction log.
  Reconcile reconstructed rosters against snapshots during sync and log
  discrepancies rather than failing
- **Picks for leagues that folded** — a pick in a season that never happened;
  mark `resolution_status = 'void'`
- **Taxi squad players** — appear in `players` but rarely score; PAR handles this
  naturally since they won't accrue started points

### 13.8 Build order

1. Ingest trades into `trade` + `trade_asset` (Phase 2)
2. Build `player_week_roster` from matchup JSON (Phase 2 — needed for other
   features anyway)
3. Player-only attribution: points rostered + points started (Phase 4)
4. Trade feed + detail UI with the two basic metrics (Phase 5)
5. Replacement level + PAR (Phase 4, second pass)
6. Pick resolution and the trade tree (Phase 4, second pass)
7. Win impact, anniversaries, awards (Phase 7)

Steps 1–4 are the minimum viable trade tracker and are worth shipping on their
own before touching pick resolution.
