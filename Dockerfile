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
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server
COPY --from=builder /app/server/data ./server/data
COPY --from=builder /app/config/leagues.example.json ./config/leagues.example.json
RUN mkdir -p /app/cache && chown -R node:node /app/cache
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist-server/index.js"]
