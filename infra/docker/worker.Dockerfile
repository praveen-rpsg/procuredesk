FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages packages
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY apps/worker apps/worker
RUN pnpm --filter @procuredesk/worker build
RUN pnpm --filter @procuredesk/worker deploy --prod /prod/worker

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Run as a non-root user for defence-in-depth
RUN addgroup -S procuredesk && adduser -S procuredesk -G procuredesk
COPY --from=build --chown=procuredesk:procuredesk /prod/worker ./
USER procuredesk

CMD ["node", "dist/main.js"]
