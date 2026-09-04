# ============================================================
# PaperFactory TypeScript Service
# Multi-stage build: deps → test → build → production
# ============================================================

# --- Stage 1: Base environment ---
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# --- Stage 2: Dependencies ---
FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# --- Stage 3: Development environment ---
FROM deps AS dev
COPY . .
CMD ["pnpm", "dev"]

# --- Stage 4: Test environment ---
FROM deps AS test
COPY . .
CMD ["pnpm", "test:coverage"]

# --- Stage 5: Build ---
FROM deps AS build
COPY . .
RUN pnpm build

# --- Stage 6: Production (minimal image) ---
FROM node:22-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

EXPOSE 3000
USER node
CMD ["node", "dist/index.js"]
