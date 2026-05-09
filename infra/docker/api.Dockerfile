FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages packages
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY apps/api apps/api
RUN pnpm --filter @procuredesk/api build
RUN pnpm --filter @procuredesk/api deploy --prod /prod/api

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Run as a non-root user for defence-in-depth
RUN addgroup -S procuredesk && adduser -S procuredesk -G procuredesk
COPY --from=build --chown=procuredesk:procuredesk /prod/api ./
USER procuredesk

EXPOSE 3000
CMD ["node", "dist/main.js"]
