# 15 — Claude Code Implementation Plan

> Part of the Seasonal Bingo Royale specification. Index: [README](README.md).

## 1. How this plan is used

- The plan is a list of **work packages (WP)**. Each WP becomes **one** task for Claude Code (CC), handed over as one self-contained English block.
- Sizing rule per WP: one subsystem; at most one new mechanism to design; one sweep; roughly a fifth of the effort for tests and the report. If CC sees two blocks’ worth of work, it says so before starting.
- One topic = one branch until done, then one merge. CC pushes after every piece of work, merges only when the task explicitly allows it, and never runs destructive git commands.
- Every WP ends with a report: lines before/after per touched file, what was removed, what was extracted, which existing helpers were reused, what was noticed but left alone, test results, and — for visible changes — exactly what the owner looks at (with a Quick Test seed once WP-08 exists).
- Each WP updates `docs/BACKLOG.md` (moves closed items from part one to part two in the same commit) and then `docs/OPEN.md`.
- Specs are the source of truth. If implementation reveals a gap or contradiction in the spec, CC stops at that point, writes the question into the report, and implements the rest — it does not invent a rule.

## 2. Work packages

Legend — **Spec**: governing sections · **Accept**: acceptance criteria · **Owner sees**: browser check (— = nothing visible).

### Phase 0 — Foundation

**WP-01 Monorepo and tooling**
Spec: 10 §1–§4, 08 §8. Already in the repo from the start (2026-10-19), to be kept and extended: `LICENSE`, `.gitattributes`, `.gitignore`, `.vscode/extensions.json`, `.claude/settings.json`, `CLAUDE.md`, `docs/`, `assets/`. pnpm workspace with all packages/apps as empty shells; TS strict base config; ESLint (boundaries, max-lines, no default export, unused variables), Prettier; Vitest workspace; lefthook; VS Code workspace; CLAUDE.md; CONTRIBUTING.md; code-review checklist; BACKLOG.md/OPEN.md.
Accept: `pnpm verify` green; a deliberate layer violation fails lint (shown in report, then removed). Owner sees: —

**WP-02 CI pipeline and container**
Spec: 08 §3–§4, 03 §18. `ci.yml` (lint, unit, integration placeholder, security scans, image build + Trivy), `release.yml` skeleton, Dockerfile multi-stage non-root, `compose.dev.yml` (Postgres, Mailpit).
Accept: CI green on push; image < 250 MB; Trivy clean. Owner sees: —

**WP-03 Server skeleton and database**
Spec: 02 §3, §7; 04 §1, §6; 05 §1; 08 §1.1. Fastify server bound to **127.0.0.1:3900** with env validation, Pino, problem-details, helmet headers, `/healthz`, `/readyz`, `/metrics`; node-postgres and an own migration runner (built instead of the planned Drizzle setup), migrations for roles/permissions/settings tables; serves a placeholder lobby page that shows the dev badge "Bingo · dev · 3900" (badge compiled out in production).
Accept: integration test boots against Testcontainers Postgres; header test passes. Owner sees: placeholder lobby page at `http://localhost:3900`.

### Phase 1 — Game rules

**WP-04 Contracts: ruleset schema and defaults**
Spec: 01 §3a, §4–§9, 11 §4. Zod `RulesetSchema` with all keys, min/max, descriptions; **game type** enum (`royale`, `classicSeasons`, `classic`), **prize catalogue** schema (01 §3a.1) with the default ticked set, and the `countsForLeaderboard` default; default rulesets `royale-realtime`, `royale-async`, `classic-seasons-realtime`, `classic-realtime`; cross-field validation (classic types forbid stages/cuts/jackpot; prizes mandatory for classic, forbidden for royale).
Accept: schema tests incl. invalid configs; defaults validate. Owner sees: —

**WP-05 Domain: cards, draws, patterns, determinism**
Spec: 01 §3a, §4–§5, §9. DRBG (HMAC-SHA256 counter), card generation per game type (royale and classic: 24 numbers + optional season cells; `classicSeasons`: 20 numbers + four season-symbol cells on different rows and columns), draw sequence over the pool for that game type (symbols 101–104 appear only in `classicSeasons`), pattern masks and detection for every prize key in 01 §3a.1 plus the custom library pattern model, commitment.
Accept: property invariants 1–3, 11, 13–14 (12 §3). Owner sees: —

**WP-06 Domain: scoring and seasons**
Spec: 01 §6, §8.1–§8.3. Base points, speed bonus, pattern scoring, effect catalog (`addPoints`, `multiplier`, `growth`, `harvest`, `shield`, `revealNext`), Season Complete.
Accept: invariants 4–6, 9; table tests for each effect. Owner sees: —

**WP-07 Domain: royale structure and classic round flow**
Spec: 01 §3a, §7, §8.4–§8.5. Stage plan, round-end conditions, cuts with shield, score carry, stage multiplier, jackpot, royale final ranking; **classic round flow** that awards every ticked prize (01 §3a.1) to every player who completes it on the deciding draw, continues until all prizes are awarded, then produces the classic placement (01 §3a.2); `decide`/`evolve` for both lifecycles.
Accept: invariants 7, 8, 10, 12; full-match simulation tests for 4, 20, 100, 200 players in royale and for 4, 20, 100 players in each classic type (seeds that produce an early `fullCard` and seeds that run to the end of the pool). Owner sees: —

**WP-08 Quick Test: play against bots in the browser**
Spec: 12 §8, 01 §3a, §13. In-memory match runner (dev builds only, behind a dev flag) using the domain; web UI: card grid with season cells (symbol icon for `classicSeasons`), draw ticker, score, effects, standings, stage/cut screens (royale), prize ticker and final placement (classic types); start form that lets the owner pick the **game type** and (for classic types) the **ticked prizes**, plus a seed field; the dev badge "Bingo · dev · 5390" (08 §1.1).
Accept: E2E smoke with fixed seed reproduces the same final ranking per game type. Owner sees: a full match vs. bots in each game type; the same seed replays identically.

### Phase 2 — Players and realtime

**WP-09 Local accounts and sessions**
Spec: 03 §2.1, §3, §8, §13 (auth limits); 05 §2.1. Register, verify e-mail, login, logout, reset, sessions table, CSRF token, rate limits for auth routes, guest sessions.
Accept: auth security tests (12 §6) for these routes. Owner sees: register/login screens.

**WP-10 Match persistence and scheduler**
Spec: 02 §5.2–§5.4, 04 §3.3. Match tables, event log, snapshots, projections (cards, standings), `PgScheduler`, per-match command queue, restart recovery.
Accept: integration test kills and restarts the server mid-match without losing events; projection = replay. Owner sees: —

**WP-11 WebSocket gateway**
Spec: 06 §1–§5, §8. Socket.IO namespaces, handshake auth and Origin check, rooms, typed envelopes, seq replay protection, ack codes, limits, resync.
Accept: WS integration tests with real clients; flood and replay rejected. Owner sees: —

**WP-12 Lobby and realtime match UI**
Spec: 05 §2.3, 06 §4, 01 §3, §6, §13. Match list, join/leave, lobby countdown, live draws, manual marking with speed window, effects, standings deltas, cut and elimination screens, spectator mode, final screen.
Accept: E2E journey 1 up to the final placement (the leaderboard step follows in WP-15) and journey 3. Owner sees: several browser windows playing one match.

**WP-13 Reconnect and robustness**
Spec: 06 §1, §4, §8. Connection state recovery, gap detection, resync, slow-client handling.
Accept: E2E journey 8. Owner sees: kill network in dev tools mid-round → game continues correctly.

### Phase 3 — Async and meta

**WP-14 Asynchronous matches**
Spec: 01 §5, §11; 06 §6. Async cadence, quiet hours, catch-up, away summary, `last_seen_event_seq`.
Accept: E2E journey 2 with time-travel hook. Owner sees: away summary after a simulated day.

**WP-15 Leaderboards, profiles, badges**
Spec: 01 §10, 04 §3.4, 05 §2.2, §2.4. Periods, league awards (idempotent), boards, profiles, badges, account deletion/export.
Accept: integration tests for awarding once; min-players rule. Owner sees: season board and profile pages.

**WP-16 Notifications and verification page**
Spec: 06 §6, 05 §2.3, §2.5, 01 §9. In-app notifications, e-mail digest, Web Push, verify bundle and page.
Accept: verification bundle recomputes results in a test. Owner sees: notification bell; “Verify this match”.

### Phase 4 — Chat

**WP-17 Chat core**
Spec: 06 §7, 03 §12, 04 §3.5. Rooms, messages, history, normalization, profanity filter, rate/spam limits, retention job.
Accept: E2E journey 6 (player side). Owner sees: chat in lobby and match.

**WP-18 Moderation**
Spec: 03 §12, 11 §3.5. Reports, sanctions, moderator inline actions, moderation queue (admin view minimal until WP-19).
Accept: E2E journey 6 (moderator side). Owner sees: mute/ban flow.

### Phase 5 — Admin

**WP-19 Admin shell, RBAC, 2FA, audit**
Spec: 03 §2.1 (TOTP), §5, §16; 11 §1–§2. Separate admin app, permission model, TOTP setup/step-up, audit log with hash chain, authz matrix test, bootstrap setup page.
Accept: authz matrix test green. Owner sees: admin login with 2FA, empty sections per permission.

**WP-20 Schema-driven settings editor**
Spec: 11 §1, §3.10, §4; 02 §6. Generic form generator from zod metadata, versions, diff, rollback; documents: features, security, rate limits, matchmaking, chat, notifications, leaderboard.
Accept: editing each document round-trips; invalid values rejected with field messages. Owner sees: settings pages.

**WP-21 Ruleset, stage and pattern editors + simulator**
Spec: 11 §3.3, 05 §3.1. Draft/publish lifecycle, stage editor with field-size preview, season effect cards, pattern grid editor, simulator in a worker with KPI comparison.
Accept: E2E journey 5. Owner sees: change Winter effect → simulate → publish.

**WP-22 Match management and series**
Spec: 11 §3.2, 05 §3, 01 §3a, §12a. Create/start/abort/kick, live view, recurring series. Match-create form carries `gameType`, prize checklist for the classic types, `countsForLeaderboard` toggle, and the optional `hostCallRef` input.
Accept: aborted match shows public notice; audit entry present; prize selection round-trips and persists in `matches.prizes`. Owner sees: create a match of each game type from the admin.

**WP-23 Branding, theme, uploads**
Spec: 11 §3.7, 03 §14, 13 (T20). Upload pipeline, season icon slots, theme tokens with live preview and contrast check, sounds.
Accept: upload security tests. Owner sees: own icons and colours in the game.

### Phase 6 — Integration

**WP-24 OIDC adapter and account linking**
Spec: 07 §2, §2.1; 03 §4, §10. Provider config (admin), discovery via SafeHttpClient, PKCE login, linking flow, role mapping with guard.
Accept: E2E journey 7 (OIDC part) against a mock provider. Owner sees: “Sign in with …” button.

**WP-25 JWT handoff, embed loader, allowlist**
Spec: 07 §2.2, §3. Handoff endpoint, replay cache, embed token, `embed.js`, postMessage protocol, `frame-ancestors`/CORS/WS origin from allowlist; test host page in `e2e/fixtures`.
Accept: E2E journey 7 (embed part), foreign origin rejected. Owner sees: game inside a test host page, signed in.

**WP-25b Live call embed**
Spec: 01 §12a, 07 §6a. Match detail renders the embedded website call view next to the match when `host_call_ref` is set; no audio/video is streamed or stored by the game. Depends on the website delivering the embeddable call view (BACKLOG) — until then this WP ships the render path behind a feature flag with a graceful empty state ("call view not available yet").
Accept: with the feature flag on and a fake call URL in a test, the iframe is rendered with the right source and sandbox; with the flag off (default) nothing is rendered. Owner sees: match detail with a right-hand call panel once the website side exists.

**WP-26 Public read API and webhooks**
Spec: 07 §5, §7. Cached public endpoints, signed webhooks with delivery log.
Accept: signature verification test; SSRF tests. Owner sees: widget example page.

### Phase 7 — Production

**WP-27 Install script, CLI, Caddy, backups**
Spec: 09 §1–§7. `install.sh`, `sbr` CLI, Caddyfile, backup timer, pull scripts, restore drill.
Accept: install on a clean Ubuntu VM (or container with systemd) succeeds twice (idempotent); restore drill passes. Owner sees: running instance on a test server.

**WP-28 Observability**
Spec: 08 §6. Metrics, Grafana dashboard, alert rules, admin dashboard tiles.
Accept: metrics endpoint exposes all listed series. Owner sees: admin dashboard with live numbers.

**WP-29 Security hardening pass**
Spec: 03 (all), 12 §6, 13. ZAP baseline, fuzzing, finalize headers, review of threat model controls, SECURITY.md, privacy features complete.
Accept: no high/critical findings open. Owner sees: —

**WP-30 Load gate and release v1.0.0**
Spec: 12 §5, 08 §2. k6 scenarios, fixes if needed, operator guide, release notes, tag.
Accept: load pass criteria met; release artifacts signed. Owner sees: v1.0.0 on staging, then production.

## 3. Dependency graph

```
01 → 02 → 03 ─┬─ 04 → 05 → 06 → 07 → 08
              │                     │
              └────────── 09 ──┬─── 10 → 11 → 12 → 13 → 14 → 15 → 16
                               │                           └─ 17 → 18
                               └─ 19 → 20 → 21 → 22 → 23
                                         24 → 25 → 25b → 26 (after 09, 19)
                                         27 → 28 → 29 → 30 (after all)
```

Packages on different branches of the graph may run in parallel overnight when they do not write the same files (e.g. WP-05 with WP-09 after WP-04 and WP-03 are merged).
