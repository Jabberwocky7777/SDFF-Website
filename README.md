# SDFF Website

The Squad Dynasty Fantasy Football league hub. Built on live [Sleeper](https://sleeper.com) data — standings, rosters, bylaws, league timeline, and scoring tools.

## Tech Stack

- **Frontend** — React 19 + Vite + TypeScript + Tailwind CSS
- **Backend** — Express 5 (Node 20) — caching proxy for the Sleeper API
- **Auth** — HTTP Basic Auth (password configured via env var)
- **Cache** — File-based JSON cache with per-route TTLs and stale fallback
- **Deploy** — Docker, auto-built via GitHub Actions → ghcr.io

## Local Development

**Prerequisites:** Node 20+

```bash
# 1. Install dependencies
npm install

# 2. Set up env vars
cp .env.example .env.local
# Edit .env.local — set LEAGUE_ID and SITE_PASSWORD

# 3. Start both servers (two terminals)
npm run dev          # Vite frontend on http://localhost:5173
npm run dev:server   # Express backend on http://localhost:3001
```

The Vite dev server proxies `/api/*` to the Express server and injects Basic Auth headers automatically.

## TrueNAS Scale Deployment

The Docker image is published automatically to `ghcr.io/jabberwocky7777/sdff-website:latest` on every push to `main`.

### First-time setup

**1. Create a TrueNAS dataset for the cache**

In the TrueNAS UI: *Datasets → Add Dataset* (e.g. `tank/apps/sdff-cache`). Note the full path (e.g. `/mnt/tank/apps/sdff-cache`).

**2. Prepare the config files on TrueNAS**

SSH into TrueNAS and create a working directory:

```bash
mkdir -p /mnt/tank/apps/sdff
cd /mnt/tank/apps/sdff

# Download compose file
curl -O https://raw.githubusercontent.com/Jabberwocky7777/SDFF-Website/main/docker-compose.yml

# Create your env file from the example
curl -O https://raw.githubusercontent.com/Jabberwocky7777/SDFF-Website/main/.env.example
cp .env.example .env
nano .env   # Fill in LEAGUE_ID and SITE_PASSWORD
```

**3. Update the volume path**

Edit `docker-compose.yml` and replace the volume line with your actual dataset path:

```yaml
volumes:
  - /mnt/tank/apps/sdff-cache:/app/cache
```

**4. Start the container**

```bash
docker compose pull
docker compose up -d
```

The site will be available on port `3001`. Point your reverse proxy (e.g. nginx, Traefik) at it.

### Updating

```bash
cd /mnt/tank/apps/sdff
docker compose pull
docker compose up -d
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `LEAGUE_ID` | Yes | — | Your Sleeper league ID |
| `SITE_PASSWORD` | Yes | — | HTTP Basic Auth password |
| `SERVER_PORT` | No | `3001` | Port the Express server listens on |
| `CACHE_DIR` | No | `/app/cache` | Directory for JSON cache files |
| `NODE_ENV` | No | `production` | Set to `development` to enable CORS for local dev |

## Architecture

Express serves both the cached Sleeper API proxy (`/api/*`) and the compiled Vite frontend (`dist/`). In development, Vite proxies API calls to Express. In production, a single Node process handles everything.

```
server/
  index.ts          # Express setup, auth middleware, health check
  cache.ts          # File-based cache with TTL and stale fallback
  routes/sleeper.ts # Sleeper API proxy routes

src/
  api/              # Frontend fetch clients
  hooks/            # React Query data hooks
  lib/              # Standings, enrichRoster, ageTier, formatters
  pages/            # Dashboard, Standings, Rosters, Timeline, Bylaws
  data/             # Hardcoded bylaws and league timeline
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Vite frontend dev server |
| `npm run dev:server` | Express backend with live reload |
| `npm run build:all` | Build frontend + compile server TypeScript |
| `npm start` | Run the compiled production server |
