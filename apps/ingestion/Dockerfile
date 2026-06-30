# Worker d'ingestion — image minimale (à lancer par cron/systemd-timer sur le VPS).
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

# Manifests (cache des deps)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/core/package.json   packages/core/package.json
COPY packages/db/package.json     packages/db/package.json
COPY packages/mypuls/package.json packages/mypuls/package.json
COPY apps/ingestion/package.json  apps/ingestion/package.json
RUN pnpm install --frozen-lockfile

# Sources
COPY packages ./packages
COPY apps/ingestion ./apps/ingestion

WORKDIR /repo/apps/ingestion
CMD ["pnpm", "start"]
