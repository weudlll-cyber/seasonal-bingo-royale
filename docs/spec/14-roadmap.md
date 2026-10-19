# 14 — Development Roadmap

> Part of the Seasonal Bingo Royale specification. Index: [README](README.md). Work packages (WP) are detailed in [15-implementation-plan.md](15-implementation-plan.md).

Phases are ordered by dependency. Each phase ends with something the owner can see in the browser, except Phase 0.

## Phase 0 — Foundation
WP-01 … WP-03. Monorepo, tooling, CI, contracts skeleton, Postgres + migrations, empty server with health endpoints, empty web/admin shells served by the server.
**Done when:** `pnpm dev` shows a placeholder lobby page; CI is green on `master`; container image builds.

## Phase 1 — The game on one screen (no accounts)
WP-04 … WP-08. Pure domain: cards, draws, patterns, scoring, seasons, Season Complete, stages and cuts, jackpot, ranking, commit-reveal. Default rulesets. Quick Test panel: single player vs. bots with a seed field.
**Done when:** the owner plays a full royale match against bots in the browser via Quick Test, with seasons, cuts and a final, and the same seed gives the same match.

## Phase 2 — Real players, realtime
WP-09 … WP-13. Local accounts and sessions, match persistence (event log + projections), scheduler, WS gateway, lobby, realtime match UI with manual marking and speed bonus, standings, reconnect.
**Done when:** several browsers play one realtime match together; a server restart in the middle of a match does not lose it.

## Phase 3 — Asynchronous play and the meta game
WP-14 … WP-16. Async cadence, quiet hours, catch-up, away summary, in-app notifications; leaderboards (periods, league points, badges); profiles; match verification page.
**Done when:** an async match runs over a day; returning players see a correct summary; the season board ranks players.

## Phase 4 — Chat and moderation
WP-17 … WP-18. Rooms, messages, filters, rate limits, reports, sanctions, moderator UI in client.
**Done when:** chat works in lobby and match; mute/ban flows work end to end.

## Phase 5 — Admin panel
WP-19 … WP-23. Admin shell + 2FA + RBAC + audit; schema-driven settings editor with versions; ruleset editor + stage editor + pattern editor + simulator; match management + series; branding/theme/uploads.
**Done when:** the owner changes a season effect, simulates, publishes, creates a match and sees the new rule in play — without touching code.

## Phase 6 — Integration
WP-24 … WP-26. OIDC adapter, JWT handoff, embed loader + postMessage + allowlist, public read API, webhooks.
**Done when:** the game runs embedded on a test host page with single sign-on; then on the Seasonal Entertainment website once its auth side is ready.

## Phase 7 — Production readiness
WP-27 … WP-30. Install script + `sbr` CLI + Caddy + backups + restore drill; observability; security hardening pass (ZAP, authz matrix, headers, upload tests); load test gate; operator guide; release v1.0.0.
**Done when:** a fresh VPS goes from nothing to a running, backed-up instance with one script; the load gate passes; v1.0.0 is tagged.

## After v1 (not scheduled)
Passkeys · Redis scale-out (step 1) · Kubernetes chart (step 2) · OAuth2-only providers (Discord) · additional languages · player-created private matches · any idea involving value or prizes (requires legal review first).
