# 08 — DevOps Architecture

> Part of the Seasonal Bingo Royale specification. Index: [README](README.md).

## 1. Environments

| Env | Where | Data | Purpose |
|---|---|---|---|
| `development` | Developer machine (Windows/macOS/Linux), `docker compose -f compose.dev.yml` for Postgres; apps run with `pnpm dev` (Vite HMR + tsx watch) | Seeded demo data, fake mailer (Mailpit) | Building and the owner’s browser checks |
| `staging` | Same VPS as production, separate Compose project `sbr-staging`, own DB, own subdomain, basic-auth in front | Synthetic data, never production copies | Release candidate check before production |
| `production` | VPS, Compose project `sbr-prod` | Real | Live |

Every environment runs the **same container image**; differences are environment variables only. The image contains no domain or host name — the address is entered at install and read at runtime (owner rule from the race project, 2026-09-07, applied here as the default).

### 1.1 Local dev ports (fixed, bound to `127.0.0.1`)

| Service | Port | Started by |
|---|---|---|
| Server (HTTP + WS) | **3900** | `pnpm dev` (apps/server) |
| Player client (web, Vite) | **5390** | `pnpm dev` (apps/web) |
| Admin client (admin, Vite) | **5391** | `pnpm dev` (apps/admin) |
| PostgreSQL | **5490** | `docker compose -f ops/compose.dev.yml up -d` |
| Mailpit (SMTP) | **1090** | compose |
| Mailpit (web UI) | **8490** | compose |

Reserved for later use by this project (never used by other projects on the
same machine): `3900`, `5390`, `5391`.

Ports **off-limits** (used by other owner projects): `3800`, `5380`, `7880`,
`7881`, `3478`, `5349`, `50000–50499`, `4000`, `5173`, `4173`, `5273`, `8000`.
Before starting anything on a port, check it is free; if a port of this project
is held by an earlier run of this project, stop that process first.

Every development page shows a small fixed badge **"Bingo · dev · &lt;port&gt;"**
in a non-intrusive corner (both clients and the server-rendered placeholder
page). The badge is compiled out in production builds — it is tied to
`import.meta.env.DEV` on the client and to `SBR_DEV=1` on the server.

The server fails closed: without settings it runs as production (`NODE_ENV` defaults to
`production`), and every development feature — quick sign-in, Quick Test, fast test rules,
bot fill, the system-abort route, load accounts, the plain-http cookie, the dev badge — needs
`SBR_DEV=1`, which the server refuses when `SBR_PUBLIC_URL` is not a localhost address.
`pnpm dev` (apps/server/dev.env), the integration-test harness and the Playwright web
server set it explicitly.

## 2. Branching and release flow

- `master` is always releasable and protected: PR required, CI green required, merges are merge commits (one topic = one branch = one merge).
- One topic = one branch until the topic is done, then one merge (owner workflow rule).
- Every push to any branch runs the fast CI checks (§3) so feature branches are verified before merge.
- Releases: tag `vX.Y.Z` (SemVer) on `master` → release workflow builds, signs and publishes the image `ghcr.io/<org>/seasonal-bingo-royale:X.Y.Z` plus SBOM and release notes generated from Conventional Commits.
- Staging deploys the release candidate tag `vX.Y.Z-rc.N`; production deploys the final tag. Both by the operator running `sbr update <version>` on the server (pull model, no CI credentials on the server).

## 3. CI pipeline (GitHub Actions)

Triggers: push on every branch, pull requests to `master`, tags.

| Job | Contents | Blocks merge |
|---|---|---|
| `lint` | ESLint (incl. boundaries, max-lines, unused variables), Prettier check, `tsc --noEmit` (all packages) | yes |
| `unit` | Vitest for `domain`, `application`, `contracts`, clients; coverage thresholds (§ [12-testing-strategy.md](12-testing-strategy.md)) | yes |
| `integration` | Vitest + Testcontainers Postgres for `server` | yes |
| `e2e` | Build, start stack in Compose, Playwright smoke suite (Chromium + Firefox + WebKit mobile viewport); runs on every push and pull request, so a branch is green in the browser before it is merged (decided 2026-10-23); traces of failed tests are kept as an artifact for a week | yes |
| `security` | `pnpm audit --prod`, osv-scanner, gitleaks, CodeQL (scheduled + PR), license check | yes (high/critical) |
| `image` | Docker build, Trivy scan, size budget (≤ 250 MB) | yes on PR to `master` |
| `docs` | Markdown link check, OpenAPI generation succeeds, file-header check in docs index | yes |
| `release` | on tag: build multi-arch (amd64, arm64), push to GHCR, cosign sign, attach SBOM | — |
| `load` | k6 scenario (§ testing) against an ephemeral stack | manual / before release |

Actions pinned by SHA, `permissions: contents: read` default, no secrets available to PRs from forks.

Note for operators of this repo: a green local check is not a green CI — after every merge to `master` the CI run for the merge commit is checked (`gh run list --branch master`).

## 4. Containers

- Multi-stage Dockerfile: `deps` (pnpm fetch) → `build` (tsc, vite) → `runtime` (`node:22-alpine` or distroless, non-root UID 10001, read-only root FS, `NODE_ENV=production`, only `dist/` and prod deps).
- One image runs three commands: `server` (HTTP + WS + scheduler), `migrate`, `cli`.
- Healthcheck: `GET /healthz`.
- Resource defaults (Compose): app 1 CPU / 768 MiB, Postgres 1 CPU / 1 GiB, Caddy 0.25 CPU / 128 MiB.

## 5. Configuration and secrets

- Runtime config only via env vars, validated at startup with zod (`apps/server/src/config/env.ts`); the process exits with a clear message on missing/invalid values.
- Required: `SBR_PUBLIC_URL`, `DATABASE_URL`, `SBR_MASTER_KEY`, `SBR_SESSION_PEPPER`, `SBR_TRUSTED_PROXIES`. Optional: `SBR_BASE_PATH` (default `/`; `/games/bingo` on the Seasonal Entertainment website), `SMTP_*`, `VAPID_*`, `SBR_LOG_LEVEL`, `SBR_METRICS_BIND`.
- Everything else (game rules, security tuning, branding) lives in the DB and is edited in the admin panel.
- Secrets file `/etc/sbr/<env>.env` (0600), generated by the install script; documented rotation procedure for each secret.

## 6. Observability

| Signal | Tooling | Notes |
|---|---|---|
| Logs | Pino JSON → Docker `local` log driver with rotation (20 MB × 5 per service, sized for small servers; decided 2026-10-23) | Optional Loki + Grafana compose profile `observability` |
| Metrics | `/metrics` on internal port 9464 | Optional Prometheus + Grafana in the same profile; ready-made dashboard JSON in `ops/grafana/` |
| Errors | Optional Sentry-protocol DSN (GlitchTip self-hosted recommended) | Off unless configured |
| Uptime | External checker (Uptime Kuma on another machine, or a hosted free tier) on `/healthz` and a synthetic “list matches” call | Monitoring from outside the VPS |
| Audit | `audit_log` table, viewable in admin | |

**Alerts** (Prometheus rules or simple checks in the admin dashboard if Prometheus is not deployed): app down > 1 min, 5xx rate > 2 % for 5 min, draw latency p95 > 1 s, DB connections > 80 %, disk > 80 %, backup older than 26 h, certificate expiry < 14 days, login failure spike.

Key metrics: `sbr_http_requests_total`, `sbr_http_duration_seconds`, `sbr_ws_connections`, `sbr_ws_intents_total{type,result}`, `sbr_draw_latency_seconds`, `sbr_matches{status}`, `sbr_players_active`, `sbr_chat_messages_total{result}`, `sbr_auth_logins_total{result}`, `sbr_rate_limited_total{route}`, `sbr_scheduler_lag_seconds`.

## 7. Dependency and patch policy

- Renovate weekly grouped PRs; security PRs immediately.
- Major version upgrades of core building blocks (Node, React, Fastify, Socket.IO, node-postgres, Vitest) are done **before** a release goes live, not right after (same principle as the owner set for the race project on 2026-10-18).
- Base image rebuilt weekly even without code changes (OS patches) → patch release.

## 8. Developer experience

- VS Code workspace file with recommended extensions (ESLint, Prettier, Vitest, Playwright, Docker, EditorConfig) and launch configs for server debug and Vitest.
- `pnpm dev` starts everything for local work: the server on **3900** and both clients (player on **5390**, admin on **5391**) in parallel. PostgreSQL and Mailpit are started separately with `docker compose -f ops/compose.dev.yml up -d` so the dev stack keeps running across restarts. `pnpm verify` runs exactly what CI's blocking jobs run except e2e/image.
- `CLAUDE.md` at the repo root tells Claude Code the rules (see [10-repository-structure.md](10-repository-structure.md)).
- Pre-commit hook (lefthook): formats staged files only. Fast (< 5 s); gitleaks and every heavier check run in CI, not in the hook.
