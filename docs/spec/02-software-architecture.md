# 02 — Software Architecture Document

> Part of the Seasonal Bingo Royale specification. Index: [README](README.md).

## 1. Architectural drivers

| Driver | Consequence |
|---|---|
| ~200 concurrent players at launch, one VPS | A **modular monolith** in one Node.js process is enough and is the simplest thing to operate. No microservices. |
| Future Kubernetes / cloud | The process is stateless apart from the database; in-process state (match timers, socket rooms, rate limits) sits behind ports with a Redis-backed adapter planned for scale-out (§8). |
| Server-authoritative game | All game rules run on the server in a pure domain layer. The client renders state and sends intents only. |
| Configurable without code | Rules are data (rulesets) validated by schemas; the domain receives a typed, validated ruleset value. |
| Standalone and embeddable | Identity is a port with three adapters (local accounts, OIDC, signed JWT handoff). The player client runs both as its own site and inside an iframe. |
| Strict code quality (Clean/Hexagonal, small files) | Layered packages with dependency rules enforced by lint, file-size limits, mandatory file headers. |

## 2. System context

```
                   ┌──────────────────────────────┐
  Player browser ──►  Caddy (TLS, HTTP/2, limits)  │
  Admin browser  ──►                              │
  SE website     ──►   (iframe embed, OIDC)       │
                   └──────────────┬───────────────┘
                                  │ HTTP + WebSocket (internal network)
                   ┌──────────────▼───────────────┐
                   │  bingo-server (Node.js)       │
                   │  HTTP API · WS gateway ·      │
                   │  match engine · scheduler     │
                   └──────┬───────────────┬────────┘
                          │               │
                 ┌────────▼──────┐  ┌─────▼─────────────┐
                 │ PostgreSQL 17 │  │ Object storage dir │
                 │               │  │ (uploads volume)   │
                 └───────────────┘  └───────────────────┘
  External (optional): OIDC provider (e.g. Seasonal Entertainment), SMTP relay, Web Push service.
```

## 3. Layers (hexagonal)

```
packages/domain        Pure TypeScript. Entities, value objects, rules, domain events.
                       No I/O, no clock, no randomness except injected. 100 % unit-testable.
packages/application   Use cases (commands + queries), ports (interfaces), DTOs.
                       Orchestrates domain + ports. No framework imports.
packages/contracts     Zod schemas + inferred types shared by server and clients:
                       HTTP DTOs, WS messages, ruleset schema. The single source of truth for shapes.
apps/server            Adapters: HTTP (Fastify), WS gateway (Socket.IO), Postgres repositories (Drizzle),
                       identity adapters, scheduler, mailer, file storage, composition root.
apps/web               Player client (React). Talks only through contracts.
apps/admin             Admin client (React). Separate bundle, separate origin path, separate CSP.
```

**Dependency rule:** `domain ← application ← server`; `contracts` may be imported by `application`, `server`, `web`, `admin`; `domain` imports nothing from the repo except its own files. Enforced with `eslint-plugin-boundaries` (or `dependency-cruiser`) in CI.

## 4. Bounded contexts

| Context | Responsibility | Key aggregates |
|---|---|---|
| **Identity & Access** | Accounts, sessions, external identities, roles, permissions, 2FA. | `Account`, `Session`, `ExternalIdentity`, `RoleAssignment` |
| **Configuration** | Rulesets, patterns, season effects, feature flags, branding, system settings — versioned. | `Ruleset` (versioned), `Pattern`, `SettingsDocument` |
| **Match** | Lobby, stages, rounds, cards, draws, marks, scoring, cuts, final ranking. | `Match` (aggregate root), `Round`, `Card`, `PlayerEntry` |
| **Leaderboard** | League points, season boards, all-time board, badges. | `LeaderboardPeriod`, `LeagueEntry`, `Badge` |
| **Chat & Moderation** | Rooms, messages, filters, mutes, bans, reports. | `Room`, `Message`, `Sanction` |
| **Notification** | In-app notices, e-mail digest, web push. | `Notification`, `Subscription` |
| **Audit** | Append-only security and admin log. | `AuditEntry` |

Contexts communicate through **domain events** published on an in-process event bus (port `EventBus`). Example: `MatchFinished` → Leaderboard awards league points; `SeasonCompleted` → Notification + Chat system message.

## 5. The match engine

### 5.1 Model

- `Match` is the aggregate root. It owns `PlayerEntry` list, current stage/round pointer, frozen `RulesetSnapshot`, `seedCommitment`.
- All state changes happen through **commands** that return **domain events**:

```
openLobby, joinMatch, leaveMatch, startMatch, startRound, drawNext,
markCell(manual), autoMarkMissed, endRound, applyCut, startStage, finishMatch, abortMatch
```

- The domain function signature pattern is `decide(state, command, ctx) -> events[]` and `evolve(state, event) -> state` (functional core). `autoMarkMissed` is issued by the scheduler when the missed-number delay after a draw has passed (01 §6). `ctx` contains the injected clock value and the DRBG for that match.

### 5.2 Persistence: event log + snapshot

- Every match event is appended to `match_events` (append-only, ordered by `seq`) in the same transaction that updates the `matches` row’s `version` (optimistic concurrency).
- Read models (current standings, per-player card state, round summaries) are projected synchronously in the same transaction for v1. This is the **CQRS** split: commands go through the aggregate; queries read projection tables.
- Recovery: on restart, a match is rebuilt from its latest snapshot (every 25 events) plus the tail of events. This also powers “While you were away” and the post-match replay.

### 5.3 Scheduling

- The scheduler is a port `MatchClock` with the DB-backed adapter `PgScheduler`: every pending timed action is a row in `scheduled_actions` (`match_id`, `kind`, `due_at`, `lease_until`).
- A single loop polls due rows every 250 ms in realtime matches’ presence, every 5 s otherwise, claims them with `FOR UPDATE SKIP LOCKED`, and executes the command. This is restart-safe and already safe for multiple instances.
- Realtime precision target: draw fires within 300 ms of `due_at` (p95).

### 5.4 Concurrency

- One command per match at a time: commands for a match are serialized through a per-match in-process queue, and the DB `version` check is the safety net.
- Manual marks are the only high-frequency player command. They do not touch the aggregate row: they are validated against the projected card state and the drawn-set, recorded in `marks`, and folded into the score at the next draw or at window close. This keeps 200 players × taps off the hot lock.

## 6. Configuration model

- **Ruleset** = one JSON document validated by the `RulesetSchema` (zod, in `contracts`). Versioned: editing creates a new draft version; publishing makes it selectable for new matches. Running matches keep the version they were opened with.
- **System settings** (security, rate limits, branding, notifications, feature flags) = separate typed documents, also versioned with audit trail, effective immediately after publish, cached in memory and invalidated via the event bus.
- Every setting has: key, schema, default, min/max, description, whether a restart is needed (goal: none), which permission may edit it.
- Defaults live in one file per document in `contracts` (`defaults/ruleset.default.ts`, …). The DB stores only published versions; a fresh install seeds version 1 from the defaults.

## 7. Cross-cutting concerns

| Concern | Approach |
|---|---|
| Validation | Zod at every boundary (HTTP body/query, WS message, config). Domain receives branded, validated types only. |
| Errors | Domain returns typed `Result` errors; adapters map to HTTP problem details (RFC 9457) or WS error frames. No exceptions for control flow. |
| Time | `Clock` port; tests use a fake clock. |
| Randomness | `Drbg` port seeded per match; `SecureRandom` port (crypto.randomBytes) for tokens. |
| Logging | Pino, structured JSON, request ID + match ID + account ID (pseudonymous). No secrets, no message bodies at info level. |
| i18n | English only; all strings in one `strings.ts` per client so a later translation is a data change. |
| IDs | UUIDv7 (time-ordered) for all entities; public match codes are short base32 slugs. |

## 8. Scale path (documented, not built in v1)

| Step | Trigger | Change |
|---|---|---|
| 0 (v1) | ≤ ~500 concurrent | One process, Postgres, in-process bus/caches. |
| 1 | CPU > 60 % sustained or > 500 concurrent | Add Redis: Socket.IO Redis adapter, Redis rate-limit store, Redis pub/sub for the event bus fan-out. Run 2+ app instances behind Caddy with sticky sessions. Match command serialization moves to a per-match lease (`scheduled_actions` already supports it). |
| 2 | Multiple hosts | Kubernetes: app Deployment (HPA), managed Postgres, Redis, object storage (S3-compatible) replacing the uploads volume. |

Every v1 port that holds in-process state names its future Redis adapter in its header comment, so step 1 is adapter work only.

## 9. Technology decisions

| Area | Choice | Rationale | Rejected alternatives |
|---|---|---|---|
| Language | **TypeScript 5 (strict)** everywhere | Strong typing across server, clients and shared contracts; one language for CC and for reviewers. | Plain JS (no types), Go/Rust server (two languages, slower iteration). |
| Runtime | **Node.js 22 LTS** | Mature, excellent WebSocket ecosystem, LTS until 2027. | Bun/Deno (younger ops story). |
| HTTP framework | **Fastify 5** | Schema-first, fast, first-class TS, built-in hooks for auth and rate limit, good security plugins (helmet, cookie, csrf). | Express (no schema layer, slower), NestJS (heavy, decorators hide flow). |
| Realtime | **Socket.IO 4** | Rooms, acknowledgements, reconnection with state recovery, Redis adapter for scale-out, works through restrictive networks. | Raw `ws` (would need to rebuild rooms/reconnect), SSE (one-directional). |
| Database | **PostgreSQL 17** | Transactions + `SKIP LOCKED` scheduling, JSONB for rulesets, row-level safety, standard on every host and every managed cloud — needed for the Kubernetes/cloud requirement. | SQLite (single-node only; would force a migration later), MongoDB (weaker transactional guarantees for scoring). |
| Data access | **Drizzle ORM + drizzle-kit migrations** | Typed SQL, parameterized by construction, plain SQL migrations reviewable in PRs. | Prisma (heavy engine binary, weaker raw SQL), raw `pg` (no types). |
| Cache | **In-process LRU** (v1), Redis 7 (scale step 1) | At 200 players a second service adds operations without benefit. | Redis from day one. |
| Frontend | **React 19 + Vite + TypeScript**, **TanStack Query**, **Zustand** for live match state, **CSS Modules** + design tokens, **Motion** for animation | Same family as the owner’s other projects, fast builds, small runtime. | Next.js (SSR not needed for a game client, more server surface). |
| Admin panel | **Separate React app** (same stack) with **React Hook Form + zod** forms generated from config schemas | Isolated bundle and CSP; forms derive from the same schemas the server validates. | Off-the-shelf admin (React-Admin/AdminJS: generic, harder to secure, another dependency tree). |
| Authentication | **Own session layer** (opaque session ID in httpOnly cookie, server-side session table), **argon2id** passwords, **TOTP** 2FA, **openid-client** for OIDC, **jose** for JWT verification | Opaque sessions are revocable instantly; JWT is used only where a foreign issuer signs it. | JWT access tokens in localStorage (XSS-exfiltratable, not revocable), Auth0/Clerk (external dependency for a self-hosted product). |
| Reverse proxy | **Caddy 2** | Automatic TLS, HTTP/3, simple config, rate-limit module. | nginx (manual cert management). |
| Logging | **Pino** → stdout → Docker log driver; optional **Loki** | Fast JSON logging; no agent required on a single VPS. | Winston (slower), ELK (too heavy). |
| Monitoring | **Prometheus metrics** endpoint (prom-client), **Grafana** optional, **Uptime Kuma** (or any external checker) for outside monitoring, **Sentry-compatible** error reporting optional (GlitchTip self-hosted) | Standard, self-hostable, works on one VPS and in Kubernetes. | Datadog/New Relic (cost, data leaves the server). |
| Testing | **Vitest** (unit/integration), **fast-check** (property tests), **Testcontainers** (Postgres), **Playwright** (E2E + embed), **k6** (load), **OWASP ZAP** baseline (DAST) | One runner for all TS code; property tests fit a rules engine. | Jest (slower with ESM/TS). |
| Package manager | **pnpm workspaces** | Strict dependency isolation, fast, lockfile integrity. | npm workspaces (hoisting hides missing deps). |
| CI/CD | **GitHub Actions**, **GHCR** images, **Renovate** or Dependabot, **CodeQL**, **gitleaks**, **Trivy**, **osv-scanner**, **CycloneDX SBOM** | All free for the repo, standard, pinned by SHA. | Self-hosted CI (more to run). |
| Containers | **Docker** multi-stage, distroless/`node:22-alpine` runtime, non-root | Small attack surface, same image for all environments. | — |
