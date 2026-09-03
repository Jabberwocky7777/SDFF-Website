# Node 22: better-sqlite3 13 requires Node >= 22 (building it against an older
# Node segfaults at runtime with no output).
FROM node:22-slim AS builder
WORKDIR /app
# Toolchain fallback in case a prebuilt better-sqlite3 binary isn't available.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:all
RUN npm prune --omit=dev

# Stage 2: Production
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV CACHE_DIR=/app/cache
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server
COPY --from=builder /app/server/data ./server/data
COPY --from=builder /app/config/leagues.example.json ./config/leagues.example.json
RUN mkdir -p /app/cache && chmod 777 /app/cache

# Fail the BUILD (visible in CI) if the native SQLite module is broken in this
# image, rather than letting it crash silently on the user's NAS.
RUN node -e "const D=require('better-sqlite3'); const db=new D('/tmp/c.db'); db.pragma('journal_mode=WAL'); db.exec('create table t(x)'); db.prepare('insert into t values(1)').run(); if(db.prepare('select count(*) c from t').get().c!==1) process.exit(1); db.close(); console.log('better-sqlite3 OK')"

# Run as root: removes the class of NAS failures where a fresh persistent volume
# isn't writable by a non-root user. The app also falls back to ephemeral
# storage (with a loud warning) rather than crashing if the volume is unusable.
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=5 \
  CMD node -e "const p=process.env.SERVER_PORT||3001;fetch('http://localhost:'+p+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist-server/index.js"]
