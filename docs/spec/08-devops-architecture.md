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
| Admin client (admin, Vite) | **5391** | planned: `pnpm dev` once apps/admin has a dev script (WP-19); reserved until then |
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
- A work branch is verified through its pull request to `master` (§3): every push to it runs CI once, as the pull request's run. Pushes to `master` run CI as well.
- Releases: tag `vX.Y.Z` (SemVer) on `master` → release workflow builds, signs and publishes the image `ghcr.io/<org>/seasonal-bingo-royale:X.Y.Z` plus SBOM and release notes generated from Conventional Commits.
- Staging deploys the release candidate tag `vX.Y.Z-rc.N`; production deploys the final tag. Both by the operator running `sbr update <version>` on the server (pull model, no CI credentials on the server).

## 3. CI pipeline (GitHub Actions)

Triggers: pull requests to `master`, pushes to `master`, tags. A push to a work branch runs no job of its own; with an open pull request it starts that pull request's run, so one push gives one run (QUIET-CI, 2026-11-01: before, each push to a branch with an open pull request ran twice and each failure was mailed twice). CodeQL has the same triggers plus its weekly schedule.

| Job | Contents | Blocks merge |
|---|---|---|
| `lint` | ESLint (incl. boundaries, max-lines, unused variables), Prettier check, `tsc --noEmit` (all packages) | yes |
| `unit` | Vitest for `domain`, `application`, `contracts`, clients; coverage thresholds (§ [12-testing-strategy.md](12-testing-strategy.md)) | yes |
| `integration` | Vitest + Testcontainers Postgres for `server` | yes |
| `e2e` | Playwright suite, side by side: Firefox and WebKit mobile viewport one job each, Chromium on three runners (`e2e (chromium 1/2)`, `e2e (chromium 2/2)`: half of the regular specs each; `e2e (chromium timing)`: the timing specs with `--no-deps`; every test runs once) and the check `e2e (chromium)` that is green only when all three are; each in the Playwright container image (browsers and their system libraries included: no apt step) with PostgreSQL as a job service; each browser runs its timing-sensitive specs after its other specs, alone on its runner; runs on every push and pull request; traces of failed tests are kept as an artifact for a week | yes |
| `security` | `pnpm audit --prod`, osv-scanner, gitleaks, CodeQL (scheduled + PR), license check | yes (high/critical) |
| `image` | Docker build, Trivy scan, size budget (≤ 250 MB) | yes on PR to `master` |
| `docs` | Markdown link check, OpenAPI generation succeeds, file-header check in docs index | yes |
| `release` | on tag: build multi-arch (amd64, arm64), push to GHCR, cosign sign, attach SBOM | — |
| `load` | k6 scenario (§ testing) against an ephemeral stack | manual / before release |

Actions pinned by SHA, `permissions: contents: read` default, no secrets available to PRs from forks.

As built (2026-10-24): `lint`, `unit` and `integration` run as one job `verify` (`pnpm verify`) followed by the coverage step, about 3 minutes; the job `coverage-integration` runs the integration tests once more beside it for the server's coverage report (2026-10-31); `security` and `docs` well under a minute; `e2e` about 4 minutes per browser, the three in parallel (by 2026-11-03 Chromium took about 11.5 minutes and Firefox and WebKit about 7; Chromium has run on three runners since 2026-11-04: the two shards about 3.5 minutes each, the timing specs alone). A full run on a branch push takes about 4 minutes (before: 10–47 minutes, of which up to 38 were spent installing browser libraries with apt, and the browsers ran one after another on one runner). There is no build to reuse between jobs: the e2e jobs run the development server and client, `image` builds the container on the way to master only.

Concurrency: a newer push to a pull request's branch cancels that pull request's older run; on `master` every commit has its own concurrency group and is never cancelled, so each merge commit gets a finished run even when merges follow each other quickly.

Note for operators of this repo: a green local check is not a green CI — after every merge to `master` the CI run for the merge commit is checked (`gh run list --branch master`).

## 4. Containers

- Multi-stage Dockerfile: `deps` (pnpm fetch) → `build` (tsc, vite) → `runtime` (`node:22-alpine` or distroless, non-root UID 10001, read-only root FS, `NODE_ENV=production`, only `dist/` and prod deps).
- One image runs three commands: `server` (HTTP + WS + scheduler), `migrate`, `cli`.
- Healthcheck: `GET /healthz`.
- Resource defaults (Compose, set in the env file): app `SBR_APP_CPUS` / `SBR_APP_MEMORY` 3 CPUs / 1 GiB, Postgres `SBR_DB_CPUS` / `SBR_DB_MEMORY` 1.5 CPUs / 1 GiB, Caddy 0.25 CPU / 128 MiB; swap equals the limit (none). Sized from the load check of 2026-11-04 (12 §5): peaks app 1.99 CPUs / 328 MiB, Postgres 0.78 CPU / 79 MiB, plus at least 50 %. A container that reaches its memory limit is restarted by Docker (`restart: unless-stopped`); other containers on the host are not touched.

## 5. Configuration and secrets

- Runtime config only via env vars, validated at startup with zod (`apps/server/src/config/env.ts`); the process exits with a clear message on missing/invalid values.
- **As built (rewritten 2026-11-04 from `env.ts`, audit-3 F1):**
  - Required: `DATABASE_URL` (in production the app role `sbr_app`; `SBR_MIGRATIONS=check` makes the app refuse to start while a migration is missing, `apply`, the default, migrates at start), and `SBR_SEED_KEY` (64 hex characters: the AES-256-GCM key that seals match seeds at rest, 04 §3.3; only development with `SBR_DEV=1` and the test suites use a fixed key).
  - Address and proxies: `SBR_PUBLIC_URL` (its origin may open the WebSocket), `SBR_BASE_PATH` (default `/`; `/games/bingo/` inside the website), `SBR_TRUSTED_PROXIES` (whose `X-Forwarded-For` is believed; none by default), `SBR_ALLOWED_ORIGINS` (extra WebSocket origins), `SBR_HOST` / `SBR_PORT` (default `127.0.0.1:3900`).
  - Sign-in: `SBR_AUTH_MODE` (`local` or `website`, D37); in website mode `SBR_WEBSITE_PROXY_SECRET` (at least 32 characters, needed with `SBR_PUBLIC_URL` and `SBR_TRUSTED_PROXIES`), the header names `SBR_WEBSITE_HEADER_ID`, `_NAME`, `_ROLES`, `_EMAIL_VERIFIED`, and `SBR_WEBSITE_LOGIN_PATH`; the website's chat beside the game (07 §6): `SBR_CHAT_PATH` (its embed page on the site, default `/embed/chat`) and `SBR_CHAT_ROOM` (the room's slug, default `bingo`).
  - Other runtime settings: `SBR_LOG_LEVEL`, the feature flags `SBR_FEATURE_EMAIL_VERIFICATION` (league points need confirmed e-mail addresses, D59) and `SBR_FEATURE_GUESTS` (two-factor sign-in has no flag: always required for local admin accounts, D60), the outgoing mail `SBR_SMTP_HOST`/`PORT`/`USER`/`PASSWORD`/`FROM` (password reset, D60), the socket caps `SBR_SOCKETS_PER_ADDRESS` (50) and `SBR_SOCKETS_PER_SESSION` (5) (06 §8), `SBR_WEB_DIR` (the built client, set by the image), `SBR_DATA_DIR` (the maintenance flag), `NODE_ENV` (default `production`) and `SBR_DEV` (development features, refused for a public address).
  - The env file also holds what the install and the stack read, never the app: `POSTGRES_PASSWORD`, the database roles' `SBR_DB_OWNER_PASSWORD`, `SBR_DB_APP_PASSWORD` and the owner's `SBR_MIGRATION_DATABASE_URL` (the compose file blanks them for the app), the resource limits (`SBR_APP_CPUS`, `SBR_APP_MEMORY`, `SBR_DB_CPUS`, `SBR_DB_MEMORY`), the backup recipient `SBR_AGE_RECIPIENT` (public key only), Caddy's address and TLS, the website route settings and the SMTP settings (stored; sending e-mail is not built).
  - **Planned, not built:** a master key `SBR_MASTER_KEY` that wraps one data-encryption key for every field-level secret (TOTP secrets, OIDC client secrets) with key ids for rotation (03 §9), and a session pepper. Today the only field-level secret is the match seed, sealed with `SBR_SEED_KEY`; session tokens are stored hashed. `SBR_METRICS_BIND` and `VAPID_*` come with metrics and Web Push.
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

**As built (2026-11-04):** besides Node's defaults (`sbr_process_*`, `sbr_nodejs_*`) and `sbr_matches_running`, the tap breakdown of 12 §5. It holds five histograms:
- `sbr_tap_lookup_seconds`: the gateway before the engine;
- `sbr_tap_wait_seconds`: arrival until the tap's batch starts;
- `sbr_tap_batch_seconds{phase=decide|append|publish}`;
- `sbr_tap_handled_seconds`: the whole tap until its answer;
- `sbr_tap_batch_size`.

And the game sockets refused (audit-3 S4): `sbr_ws_refused_total{reason=origin|address|session}`.

And the store (PERF-TAPS): `sbr_store_append_round_trips{kind=taps|other}`, the round trips to PostgreSQL per stored batch (1 for a batch of taps, a draw or a window close; more for a join, the finish or a batch with a snapshot).

Also what the live updates cost (12 §5):
- `sbr_live_build_seconds{kind=fetch|frame}`: building and serializing a state answer (after its waits) or a step's frames;
- `sbr_live_bytes_total{kind}`: the answers' bytes, and the frames' bytes times their recipients.

`sbr loadcheck` reads them before and after its run and prints the tap breakdown (with the round trips per tap batch) and the per-draw cost. `sbr loadcheck --cpuset <cpus>` pins the load generator to those CPUs (instead of capping it at 2), so its own work does not count as the game's.

## 7. Dependency and patch policy

- Renovate weekly grouped PRs; security PRs immediately.
- Major version upgrades of core building blocks (Node, React, Fastify, Socket.IO, node-postgres, Vitest) are done **before** a release goes live, not right after (same principle as the owner set for the race project on 2026-10-18).
- Base image rebuilt weekly even without code changes (OS patches) → patch release.

## 8. Developer experience

- VS Code workspace file with recommended extensions (ESLint, Prettier, Vitest, Playwright, Docker, EditorConfig) and launch configs for server debug and Vitest.
- `pnpm dev` starts everything for local work: the server on **3900** and the player client on **5390** in parallel (the admin client on **5391** joins once it has a dev script, WP-19). PostgreSQL and Mailpit are started separately with `docker compose -f ops/compose.dev.yml up -d` so the dev stack keeps running across restarts. `pnpm verify` runs exactly what CI's blocking jobs run except e2e/image. The server restarts on changes to its own sources and the workspace packages only (`tsx watch`, excluding `node_modules`, test output, coverage, `reports/` and its data folder): before 2026-11-04 `node --watch` also restarted it when a file inside `node_modules` changed, which broke sign-ins in the middle of e2e runs. The full e2e suite in all browsers runs in CI only; locally the specs that read a change run in Chromium (CLAUDE.md, Testing).
- `CLAUDE.md` at the repo root tells Claude Code the rules (see [10-repository-structure.md](10-repository-structure.md)).
- Pre-commit hook (lefthook): formats staged files only. Fast (< 5 s); gitleaks and every heavier check run in CI, not in the hook.
