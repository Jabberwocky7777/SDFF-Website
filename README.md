# Squad Fantasy Hub

A multi-league fantasy football hub built on the [Sleeper](https://sleeper.com)
API — live standings and rosters plus deep historical analytics (head-to-head,
records, all-time standings, luck metrics, power rankings, a trade tracker)
across every league you add.

Everything lives inside a league: pick a league and its sub-nav adapts to what
that league supports. Dynasty leagues additionally get the dues dashboard,
rookie-pick tracker, bylaws, calendar and news.

## Tech Stack

- **Frontend** — React 19 + Vite + TypeScript + Tailwind CSS
- **Backend** — Express 5 (Node 22). SQLite (`better-sqlite3`) for stored
  history; file cache for live/volatile data.
- **Auth** — a commissioner password (set on first run) + per-league access
  codes, all managed from the in-app Settings screen. No config files.
- **Hardening** — strict CSP + security headers, `Disallow: /` robots, structured
  JSON request logs, nightly `VACUUM INTO` database backups.
- **Deploy** — Docker, auto-built via GitHub Actions → ghcr.io

## Local Development

**Prerequisites:** Node 22+ (`better-sqlite3` v13 requires it)

```bash
npm install

# Run it (two terminals)
npm run dev          # Vite frontend  → http://localhost:5173
npm run dev:server   # Express backend → http://localhost:3001
```

Open http://localhost:5173, create a commissioner password, then add leagues
from **Settings** — paste a Sleeper league ID or use "Find my leagues" with your
Sleeper username. Each league's history backfills automatically.

## TrueNAS Scale Deployment

Everything is done from the **TrueNAS web UI** and the app's own Settings screen
— no SSH, no host files, no env vars.

The image publishes to `ghcr.io/jabberwocky7777/sdff-website:latest` on every
push to `main`.

### Install

1. **Apps → Discover Apps → Custom App → Install via YAML.**
2. Paste [`docker-compose.yml`](docker-compose.yml) from this repo. Adjust the
   published port (`7780`) and `TZ` if you like. **Save.**
3. Open the app in your browser (via your reverse proxy or the host port).
4. Create a **commissioner password**.
5. **Settings → Add a league** — "Find my leagues" (enter your Sleeper username)
   or paste a Sleeper league ID. Repeat for each league. Each one's full history
   backfills in the background; the access code is generated for you (editable).

A named volume (`sdff-data`) is created and managed by TrueNAS for the SQLite DB,
cache, session key and admin-entered data — it survives updates and redeploys.

### Managing leagues

All in **Settings** (visible when logged in as the commissioner): add / rename /
recolour / remove leagues, change or copy access codes, update a league's
Sleeper ID when a new dynasty season starts, re-sync history, change the
commissioner password. The **Sync & backups** panel shows recent sync runs,
last-run errors and stored backups, with buttons to sync or back up on demand.

### Updating

**Apps → sdff-web → Update**. The volume persists, so no re-backfill.

### Optional env overrides

Everything has a sensible default; set these in the compose `environment:` block
only if needed.

| Env var | Default | Description |
|---|---|---|
| `SERVER_PORT` | `3001` | Port inside the container |
| `CACHE_DIR` | `/app/cache` | DB + cache + `.session-secret` (the `sdff-data` volume) |
| `SESSION_SECRET` | auto-generated | Only set if running multiple replicas |
| `AUTO_BACKFILL` | on | `0` disables the first-run / new-league self-backfill |
| `SYNC_ENABLED` | `1` | `0` stops the background refresh scheduler |
| `RESET_ADMIN` | — | Set to any new value to clear the commissioner password so the setup screen reappears (leagues kept). Safe to leave set — it only fires once per distinct value. |
| `BACKUP_ENABLED` | `1` | `0` disables the nightly `VACUUM INTO` backup to `<CACHE_DIR>/backups/` |
| `BACKUP_KEEP` | `7` | How many nightly backup files to retain |
| `CORS_ORIGIN` | — | Allow browser XHR from this exact origin (default: same-origin only) |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` for the JSON request/app logs |
| `TZ` | `America/New_York` | Scheduler game-day windows + backup time |
| `LEAGUES_JSON` | — | One-time import of a legacy `{leagues, adminCode}` config on a fresh DB. After first boot the DB is authoritative and this is ignored. |

## Architecture

```
server/
  config/leagues.ts     DB-backed league registry + access-code resolution
  config/bootstrap.ts   one-time legacy-config import
  db/                   schema (migrations/), migrate.ts, index.ts (connection)
  sleeper/              rate-limited client, Zod schemas, chain walker, discovery, external sources
  sync/                 backfill queue + incremental ingest + cron scheduler + nightly backup
  analytics/            pure query functions over SQLite (unit-tested) — incl. trades.ts
  routes/               setup, auth, admin-leagues, leagues/:slug/*, legacy proxy
  auth/                 session cookie + middleware + admin password (scrypt)
  security.ts / log.ts  CSP + headers, structured JSON logging
src/
  context/              Auth, Leagues, LeagueScope providers
  components/auth/       SetupScreen, SplashScreen
  components/hub/        HubLayout (capability-aware sub-nav), LeagueSwitcher, FreshnessNote
  components/ErrorBoundary.tsx
  pages/AdminSettings    league + account management + sync/backup status
  pages/hub/             Overview, Standings, History, HeadToHead, Records, Power, Managers, Trades
  pages/                 in-league pages: Rosters, Draft, DraftGrades, Dues, Picks, Bylaws, …
```

Every route is nested under `/l/:slug/*`; live data is proxied per league via
`/api/leagues/:slug/live/*`. Historical/computed data → SQLite. Live/volatile
data → file cache. The frontend never calls Sleeper directly.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` / `npm run dev:server` | Frontend / backend dev servers |
| `npm run build:all` | Build frontend + compile server |
| `npm start` | Run the compiled production server |
| `npm run db:migrate` | Apply SQLite migrations, print schema summary |
| `npm run leagues:discover -- --username <name>` | List your Sleeper leagues + IDs |
| `npm run sync:backfill -- --league <slug\|all> [--force]` | Full historical ingest |
| `npm run sync:incremental` | Current-season refresh |
| `npm test` | Vitest |
| `npm run lint` | ESLint |
