# @file   Dockerfile
# @module repo
# @brief  Multi-stage image of the app: deps -> build -> runtime (server, player client, admin placeholder).
#
# Responsibility: fetch dependencies from the lockfile only; build the player client (Vite,
#                 relative paths, so one image serves at "/" or under any SBR_BASE_PATH)
#                 and the server bundle (esbuild, apps/server/build.mjs) inside a full
#                 toolchain stage; ship a small non-root runtime with the bundle, its npm
#                 dependencies and the client only. With NODE_ENV=production no development
#                 route is registered (apps/server/test/deployment.integration.test.ts). It
#                 runs on a read-only root filesystem with /tmp in memory and /data as its
#                 one writable volume (ops/compose.yml).
# Used by:        .github/workflows/ci.yml (job image), .github/workflows/release.yml, ops/install.sh
# Spec:           docs/spec/08-devops-architecture.md §4, docs/spec/03-security-architecture.md §18

# Base pinned by digest; Renovate keeps tag and digest current.
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS base
WORKDIR /app
# CI=true keeps pnpm non-interactive and makes lefthook skip installing git hooks.
ENV CI=true
# Corepack installs the pnpm version named in package.json "packageManager".
RUN corepack enable

# deps: download every package of the lockfile into the pnpm store. Depends only on the
# lockfile, so this layer stays cached until dependencies change.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch

# build: install offline from the store, build the client and the server bundle, then
# collect the server's production files (package.json "files": dist) and the client.
FROM deps AS build
COPY . .
RUN pnpm install --frozen-lockfile --offline
RUN pnpm --filter @sbr/web build && pnpm --filter @sbr/server build
# The workspace packages are inside the bundle, so their copies are not shipped.
RUN pnpm --filter @sbr/server deploy --prod --legacy /out \
  && rm -rf /out/node_modules/@sbr \
  && cp -r apps/web/dist /out/web

# runtime: production files only, owned by root and therefore read-only for the app user.
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS runtime
ENV NODE_ENV=production \
    SBR_WEB_DIR=/app/web \
    SBR_HOST=0.0.0.0 \
    SBR_PORT=3000 \
    SBR_DATA_DIR=/data
WORKDIR /app
# The app needs only node: drop the bundled package managers (npm, corepack, yarn) and the
# vulnerabilities that ship with them, then add the unprivileged app user and its one
# writable directory (a new named volume takes this ownership).
RUN rm -rf /usr/local/lib/node_modules /opt/yarn-* \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /usr/local/bin/yarn /usr/local/bin/yarnpkg \
  && addgroup -S -g 10001 sbr && adduser -S -u 10001 -G sbr -H sbr \
  && mkdir /data && chown 10001:10001 /data
COPY --from=build /out ./
USER 10001:10001
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "--enable-source-maps", "dist/main.js"]
