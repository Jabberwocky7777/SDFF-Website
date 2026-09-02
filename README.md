# Squad Fantasy Hub

A multi-league fantasy football hub built on the [Sleeper](https://sleeper.com)
API — live standings and rosters plus deep historical analytics (head-to-head,
records, all-time standings, luck metrics, power rankings) across every league
you add.

## Tech Stack

- **Frontend** — React 19 + Vite + TypeScript + Tailwind CSS
- **Backend** — Express 5 (Node 20). SQLite (`better-sqlite3`) for stored
  history; file cache for live/volatile data.
- **Auth** — per-league access codes → signed session cookie. No site password.
- **Deploy** — Docker, auto-built via GitHub Actions → ghcr.io

## Local Development

**Prerequisites:** Node 20+

```bash
npm install

# 1. League config (holds the access codes — gitignored)
cp config/leagues.example.json config/leagues.json

# 2. Find your league IDs, then edit config/leagues.json:
#    real currentLeagueId + a short accessCode for each league, and an adminCode
npm run leagues:discover -- --username <your_sleeper_username>

# 3. Run it (two terminals)
npm run dev          # Vite frontend  → http://localhost:5173
npm run dev:server   # Express backend → http://localhost:3001
```

On first start the server backfills every league's history in the background
(~1-2 min). To do it upfront instead: `npm run sync:backfill -- --league all`.

Open the site and log in with a league's `accessCode` (or the `adminCode`).

## TrueNAS Scale Deployment

Everything is done from the **TrueNAS web UI** — no SSH, no host files.

The image publishes to `ghcr.io/jabberwocky7777/sdff-website:latest` on every
push to `main`.

### Install

1. **Apps → Discover Apps → Custom App → Install via YAML.**
2. Paste [`docker-compose.yml`](docker-compose.yml) from this repo.
3. In the pasted YAML, edit the `LEAGUES_JSON` value: for each league set a real
   numeric `currentLeagueId`, a short `accessCode` (min 3 chars), and set
   `adminCode`. (IDs come from the Sleeper app URL, or run
   `npm run leagues:discover -- --username <you>` locally.)
4. Adjust the published port (`7780`) and `TZ` if needed. Save.

That's it. On first start the server **self-populates** history for every
configured league (a few minutes in the background — the app is usable
immediately, history pages fill in as they load). A named volume (`sdff-data`)
is created and managed by TrueNAS for the SQLite DB, cache, session key and
admin-entered data; it survives updates and redeploys.

Point your reverse proxy at the published host port. Log in with a league's
`accessCode` (or the `adminCode`).

### Adding a league later

**Edit** the app in the TrueNAS UI, add the league object to `LEAGUES_JSON`,
**Save**. The server backfills the new league's history automatically on the
next start. Nothing else to do.

### Updating

**Apps → sdff-web → Update** (or it auto-updates if you enabled that). The
volume persists, so no re-backfill.

### Config reference

`LEAGUES_JSON` may be raw JSON or base64-encoded JSON. All other settings have
defaults; override via the `environment:` block only if needed:

| Env var | Default | Description |
|---|---|---|
| `LEAGUES_JSON` | — | The league config, inline (JSON or base64). Alternative: mount a file at `/app/config/leagues.json`. |
| `SERVER_PORT` | `3001` | Port inside the container |
| `CACHE_DIR` | `/app/cache` | DB + JSON cache + `.session-secret` (the `sdff-data` volume) |
| `SESSION_SECRET` | auto-generated | Only set if running multiple replicas |
| `AUTO_BACKFILL` | on | Set `0` to disable the first-run self-backfill |
| `SYNC_ENABLED` | `1` | Set `0` to stop the background refresh scheduler |
| `TZ` | `America/New_York` | Affects the scheduler's game-day windows |
| `DB_PATH` | `<CACHE_DIR>/sdff.db` | SQLite file location |
| `LEAGUES_CONFIG_PATH` | `./config/leagues.json` | Config file path (when not using `LEAGUES_JSON`) |

## Architecture

```
config/leagues.json     league config for local dev (gitignored); prod uses LEAGUES_JSON
server/
  config/leagues.ts     Zod config loader
  db/                   schema (migrations/), migrate.ts, index.ts (connection)
  sleeper/              rate-limited client, Zod schemas, previous_league_id walker
  sync/                 backfill + incremental ingest, cron scheduler
  analytics/            pure query functions over SQLite (unit-tested)
  routes/               auth, leagues/:slug/*, legacy single-league proxy
  auth/                 signed session cookie + middleware
src/
  api/                  frontend fetch clients
  context/              Auth + Leagues providers
  components/hub/        HubLayout, LeagueSwitcher
  pages/hub/             Overview, Standings, History, HeadToHead, Records, …
  pages/                 SDFF dynasty pages (Dashboard, Rosters, Draft, Dues, …)
```

Historical/computed data → SQLite. Live/volatile data → file cache. The frontend
never calls Sleeper directly.

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
