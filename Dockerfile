# @file   Dockerfile
# @brief  Multi-stage image for the server: deps -> build -> runtime.
#
# Responsibility: fetch dependencies from the lockfile only, build inside a full toolchain
#                 stage, and ship a small non-root runtime with production files only.
# Used by:        .github/workflows/ci.yml (job image), .github/workflows/release.yml
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

# build: install offline from the store, then collect the server's production files.
FROM deps AS build
COPY . .
RUN pnpm install --frozen-lockfile --offline
# WP-03 adds the compile step (tsc, vite) here, before the deploy below.
RUN pnpm --filter @sbr/server deploy --prod /out

# runtime: production files only, owned by root and therefore read-only for the app user.
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS runtime
ENV NODE_ENV=production
WORKDIR /app
# The app needs only node: drop the bundled package managers (npm, corepack, yarn) and the
# vulnerabilities that ship with them, then add the unprivileged app user.
RUN rm -rf /usr/local/lib/node_modules /opt/yarn-* \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /usr/local/bin/yarn /usr/local/bin/yarnpkg \
  && addgroup -S -g 10001 sbr && adduser -S -u 10001 -G sbr -H sbr
COPY --from=build /out ./
USER 10001:10001
# HEALTHCHECK enabled in WP-03 when /healthz exists:
# HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
#   CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
# Placeholder until WP-03 brings the server entry point.
CMD ["node", "-e", "console.log('sbr image ok')"]
