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

**No config files.** The commissioner sets a password on first run (`/setup`),
then adds/manages leagues + access codes from the in-app **Settings** screen
(`/settings`, `AdminSettings.tsx` → `/api/admin/*`). Leagues live in the
`league_family` table (`server/config/leagues.ts` is the DB-backed registry).
Admin password: scrypt in `kv` (`server/auth/admin.ts`). Session key:
`SESSION_SECRET` or auto-generated to `<CACHE_DIR>/.session-secret`.

Adding a league validates the Sleeper ID and queues a background backfill
(`server/sync/trigger.ts` — one at a time). `server/sync/lock.ts` is the shared
mutex across backfill / scheduler / autobackfill. `AUTO_BACKFILL=0` disables the
first-run self-backfill. `LEAGUES_JSON` env / `config/leagues.json` are imported
once into the DB on a fresh install (`server/config/bootstrap.ts`), then ignored.

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
