# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22.22.1
FROM node:${NODE_VERSION}-bookworm-slim AS base

ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    PRISMA_HIDE_UPDATE_MESSAGE=1 \
    CHECKPOINT_DISABLE=1

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates openssl tini \
    && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
WORKDIR /workspace
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY tsconfig.json ./
COPY prisma ./prisma
COPY scripts ./scripts
COPY src ./src
RUN node scripts/sync-postgresql-schema.mjs \
    && DATABASE_URL='postgresql://schema_generator:build-only@127.0.0.1:5432/financeiro?schema=public' \
       node node_modules/prisma/build/index.js generate \
       --schema prisma/postgresql/schema.prisma \
    && npm run build \
    && npm prune --omit=dev \
    && npm cache clean --force

FROM base AS runtime

ENV NODE_ENV=production \
    PORT=3002 \
    FINANCEIRO_BIND_HOST=0.0.0.0 \
    FINANCEIRO_SWAGGER_ENABLED=false \
    FINANCEIRO_DATABASE_RUNTIME_ROLE=financeiro_runtime \
    FINANCEIRO_DATABASE_REQUIRE_LEAST_PRIVILEGE=true \
    FINANCEIRO_FISCAL_ARTIFACT_STORAGE_MODE=database \
    FINANCEIRO_SICOOB_POWERSHELL_ENABLED=false

RUN groupadd --gid 10001 financeiro \
    && useradd --uid 10001 --gid 10001 --no-create-home \
       --home-dir /nonexistent --shell /usr/sbin/nologin financeiro

WORKDIR /app
COPY --from=build --chown=10001:10001 /workspace/package.json ./
COPY --from=build --chown=10001:10001 /workspace/node_modules ./node_modules
COPY --from=build --chown=10001:10001 /workspace/dist ./dist
COPY --from=build --chown=10001:10001 /workspace/scripts/sicoob-*.ps1 ./scripts/
COPY --from=build --chown=10001:10001 /workspace/scripts/runtime-entrypoint.mjs ./scripts/

USER 10001:10001
EXPOSE 3002
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3002/api/v1/health/ready',{signal:AbortSignal.timeout(4000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "scripts/runtime-entrypoint.mjs"]
