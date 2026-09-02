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

# 3. Build the history DB (needs the real IDs from step 2)
npm run sync:backfill -- --league all    # one-time, ~1-2 min

# 4. Run it (two terminals)
npm run dev          # Vite frontend  → http://localhost:5173
npm run dev:server   # Express backend → http://localhost:3001
```

Open the site and log in with a league's `accessCode` (or the `adminCode`).

## TrueNAS Scale Deployment

The image publishes to `ghcr.io/jabberwocky7777/sdff-website:latest` on every
push to `main`.

### What you need on the host

| Path | What | Dataset? |
|---|---|---|
| `/app/cache` | SQLite history DB (`sdff.db`), JSON cache, auto-generated `.session-secret` | **Yes** — so the DB is snapshotted. Reuse your existing sdff cache dataset. |
| `/app/config` | `leagues.json` (league IDs + access codes) | No — a plain directory is fine. Must contain `leagues.json` **before first start**. |

**No new dataset is required** if you already have a cache dataset from the
single-league version — the DB just lands alongside the JSON files. You only need
a `config` directory (can live next to `docker-compose.yml`).

### First-time setup

```bash
mkdir -p /mnt/tank/apps/sdff/config
cd /mnt/tank/apps/sdff

curl -O https://raw.githubusercontent.com/Jabberwocky7777/SDFF-Website/main/docker-compose.yml
curl -o config/leagues.json https://raw.githubusercontent.com/Jabberwocky7777/SDFF-Website/main/config/leagues.example.json
nano config/leagues.json    # set currentLeagueId + accessCode for each league, and adminCode

touch .env                   # compose expects the file to exist; it can stay empty
```

Every runtime setting has a sane default, so `.env` can be empty. Populate it
only to override something — see [`.env.example`](.env.example).

Edit `docker-compose.yml` so the two volume paths match your host:

```yaml
volumes:
  - /mnt/tank/apps/sdff-cache:/app/cache      # your existing cache dataset
  - /mnt/tank/apps/sdff/config:/app/config    # the directory holding leagues.json
```

Start it:

```bash
docker compose pull
docker compose up -d
```

**Populate history (one-time).** The DB starts empty — run the backfill inside
the container:

```bash
docker compose exec sdff-web node dist-server/scripts/sync-backfill.js --league all
```

After that, an in-process scheduler keeps the current season fresh (hourly, plus
every 15 min on game days). Site is on port `3001` inside the container — point
your reverse proxy at the published host port (`7780` in the sample compose).

### Adding a league later

Edit `config/leagues.json` (add the entry with its `accessCode`),
`docker compose restart sdff-web`, then:

```bash
docker compose exec sdff-web node dist-server/scripts/sync-backfill.js --league <slug>
```

### Updating

```bash
cd /mnt/tank/apps/sdff && docker compose pull && docker compose up -d
```

## Configuration

`config/leagues.json` is the only required config. See
[`config/leagues.example.json`](config/leagues.example.json).

| Env var | Default | Description |
|---|---|---|
| `SERVER_PORT` | `3001` | Port the server listens on |
| `CACHE_DIR` | `/app/cache` | JSON cache + `sdff.db` + `.session-secret` |
| `DB_PATH` | `<CACHE_DIR>/sdff.db` | SQLite file location |
| `SESSION_SECRET` | auto-generated | Only set this if running multiple instances |
| `LEAGUES_CONFIG_PATH` | `./config/leagues.json` | Override config location |
| `SYNC_ENABLED` | `1` | Set `0` to disable the background sync scheduler |
| `NODE_ENV` | `production` | — |

## Architecture

```
config/leagues.json     league identity/routing/codes (gitignored, volume-mounted)
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
