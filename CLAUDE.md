# CLAUDE.md

## Project
Multi-league fantasy football hub built on the Sleeper API. React 19 + Vite +
TypeScript frontend, Express 5 backend, SQLite (better-sqlite3) for historical
data, file cache for live data. Deployed via Docker to TrueNAS Scale.

Full design doc: `PLAN.md` in the repo root.

## Current focus
Expanding the single-league SDFF dynasty site into a multi-league hub. Two
leagues to start:
- **SDFF** — dynasty, brand new (2026 is season 1)
- **A redraft league** — ~8 seasons of history, has had managers added/removed
  and expanded 10 → 12 teams mid-history

Leagues stay **siloed** for now: head-to-head and records are scoped to one
league family. No cross-league aggregation UI yet (but `manager` is still a
global table keyed by Sleeper `user_id`).

Access is per-league and code-only — there is **no site password**. Each league
in `config/leagues.json` has its own short `accessCode`; entering it sets a
signed session cookie unlocking that league. The top-level `adminCode` unlocks
every league plus the admin panel. `config/leagues.json` is required (mounted as
a volume in prod). The session signing key comes from `SESSION_SECRET` or is
auto-generated into `<CACHE_DIR>/.session-secret`.

## Architecture rules
- Historical/computed data -> SQLite. Live/volatile data -> file cache proxy.
- Never call the Sleeper API from the frontend. All Sleeper access goes through
  the server.
- Never fetch `/players/nfl` outside the daily sync job.
- League IDs come from `config/leagues.json` only. Never hardcode. Always
  validate a request's `:slug` against the config before touching Sleeper.
- Analytics live in `server/analytics/` as pure functions over query results,
  so they can be unit-tested without a network or DB.
- Server is ESM (`"type": "module"`, `tsconfig.node.json` uses `NodeNext`).
  Import specifiers in `server/` must include the `.js` extension.

## Commands
```
npm run dev              # Vite frontend (5173)
npm run dev:server       # Express backend (3001), tsx watch
npm run build:all        # Build frontend + compile server
npm run start            # Run compiled production server
npm run lint             # eslint
npm run db:migrate       # Apply SQLite migrations
npm run leagues:discover -- --username <sleeper_username>
npm run sync:backfill -- --league <slug|all>
npm run sync:incremental
npm test                 # Vitest (once added)
```

## Layout
```
config/leagues.json        # league identity/routing/codes (gitignored, volume-mounted)
server/config/leagues.ts   # Zod loader + LEAGUE_ID backward-compat shim
server/db/                 # schema.sql, migrate.ts, index.ts (connection singleton)
server/sleeper/            # rate-limited client, Zod schemas, previous_league_id walker
server/sync/               # backfill + incremental ingest (Phase 2)
server/analytics/          # pure query functions (Phase 4)
server/scripts/            # one-off CLIs (discover, merge-managers)
server/routes/             # Express routers
src/                       # React frontend
```

## Conventions
- Strict TypeScript. No `any` in analytics code.
- Zod-validate every external API response at the boundary.
- Every new analytics function needs a unit test with fixture data.
- Points as numbers, never strings. Guard against null `points`.
- Keep `main` deployable at every step.
