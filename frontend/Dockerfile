# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22.22.1
FROM node:${NODE_VERSION}-bookworm-slim AS base

ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
WORKDIR /workspace
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
ARG NEXT_PUBLIC_FINANCEIRO_BASE_PATH=/financeiro-app
ARG NEXT_PUBLIC_FINANCEIRO_ORIGIN_API_URL=/api/financeiro
ARG NEXT_PUBLIC_FINANCEIRO_PARENT_ORIGINS=
ENV NEXT_PUBLIC_FINANCEIRO_BASE_PATH=${NEXT_PUBLIC_FINANCEIRO_BASE_PATH} \
    NEXT_PUBLIC_FINANCEIRO_ORIGIN_API_URL=${NEXT_PUBLIC_FINANCEIRO_ORIGIN_API_URL} \
    NEXT_PUBLIC_FINANCEIRO_PARENT_ORIGINS=${NEXT_PUBLIC_FINANCEIRO_PARENT_ORIGINS}
COPY next.config.ts postcss.config.mjs tsconfig.json next-env.d.ts ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM base AS runtime

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3003 \
    NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates tini \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 financeiro_frontend \
    && useradd --uid 10001 --gid 10001 --no-create-home \
       --home-dir /nonexistent --shell /usr/sbin/nologin financeiro_frontend

WORKDIR /app
COPY --from=build --chown=10001:10001 /workspace/.next/standalone ./
COPY --from=build --chown=10001:10001 /workspace/.next/static ./.next/static
COPY --from=build --chown=10001:10001 /workspace/public ./public

USER 10001:10001
EXPOSE 3003
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3003/financeiro-app/',{signal:AbortSignal.timeout(4000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
