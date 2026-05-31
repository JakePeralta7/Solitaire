# ── Stage 1: deps (build native modules) ─────────────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /build

# Required to compile better-sqlite3 native addon
RUN apk add --no-cache python3 make g++

COPY backend/package.json ./
RUN corepack enable && pnpm install --prod

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine

# tini for proper PID 1 signal handling
RUN apk add --no-cache tini

WORKDIR /app

# Copy production node_modules from deps stage
COPY --from=deps /build/node_modules ./backend/node_modules

# Copy application source
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Create data directory for SQLite volume mount
RUN mkdir -p /data

# Non-root user
RUN addgroup -S solitaire && adduser -S solitaire -G solitaire \
    && chown -R solitaire:solitaire /app /data

USER solitaire

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "backend/server.js"]
