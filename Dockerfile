# Stage 1: Build
# Debian slim (not alpine): better-sqlite3 ships glibc prebuilds, so no native
# toolchain or musl rebuild headaches.
FROM node:20-slim AS builder
WORKDIR /app
# Toolchain fallback in case a prebuilt better-sqlite3 binary is unavailable.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:all
# Drop dev dependencies but keep the compiled native modules.
RUN npm prune --omit=dev

# Stage 2: Production
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV CACHE_DIR=/app/cache
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server
COPY --from=builder /app/server/data ./server/data
COPY --from=builder /app/config/leagues.example.json ./config/leagues.example.json
# Pre-create the data dir world-writable so a fresh named/ix volume inherits it.
RUN mkdir -p /app/cache && chmod 777 /app/cache

# Run as root: this is a self-hosted app behind a login, and it removes the
# most common NAS failure (a persistent volume a non-root user can't write to).
# The app write-tests CACHE_DIR at startup and exits with a clear message if
# it still can't write there.
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://localhost:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist-server/index.js"]
