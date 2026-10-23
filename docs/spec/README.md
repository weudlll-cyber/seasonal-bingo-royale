# Seasonal Bingo Royale — Specification

Complete blueprint for implementation by Claude Code. The code follows it; what is built and what is open is in [docs/OPEN.md](../OPEN.md) and [docs/BACKLOG.md](../BACKLOG.md).

## 1. Documents

| # | Document | Covers |
|---|---|---|
| 01 | [Game Design](01-game-design.md) | Card, draws, marking, seasons, Season Complete, battle royale stages and cuts, scoring, jackpot, fairness, leaderboards |
| 02 | [Software Architecture](02-software-architecture.md) | Modular monolith, hexagonal layers, bounded contexts, match engine, configuration model, scale path, **technology decisions with rationale** |
| 03 | [Security Architecture](03-security-architecture.md) | AuthN/Z, RBAC, sessions, JWT, CSRF/XSS/SQLi/SSRF, crypto, anti-cheat, chat safety, rate limits, uploads, backup/DR, audit, OWASP mapping, supply chain |
| 04 | [Database Design](04-database-design.md) | PostgreSQL schema, constraints, sizing, migrations, seed |
| 05 | [API Design](05-api-design.md) | REST endpoints (player, admin), errors, pagination, simulator |
| 06 | [Realtime Architecture](06-realtime-architecture.md) | Socket.IO protocol, rooms, draw flow, async mode, chat pipeline, limits |
| 07 | [Integration Architecture](07-integration-architecture.md) | Standalone vs. integrated, OIDC, JWT handoff, embedding, Seasonal Entertainment mapping, webhooks |
| 08 | [DevOps Architecture](08-devops-architecture.md) | Environments, CI/CD, containers, config, observability, patch policy |
| 09 | [Deployment Architecture](09-deployment-architecture.md) | Single-VPS Compose, install script, `sbr` CLI, backups, variants, Kubernetes path |
| 10 | [Repository Structure](10-repository-structure.md) | Folder layout, size rules, file header, review checklist, CLAUDE.md outline |
| 11 | [Admin Panel](11-admin-panel.md) | Screens, configuration catalogue |
| 12 | [Testing Strategy](12-testing-strategy.md) | Pyramid, invariants, E2E journeys, load gate, security tests |
| 13 | [Threat Model](13-threat-model.md) | STRIDE per boundary, residual risks |
| 14 | [Roadmap](14-roadmap.md) | Phases 0–7 with visible outcomes |
| 15 | [Implementation Plan](15-implementation-plan.md) | 30 work packages for Claude Code with acceptance criteria |

## 2. Fixed by the owner (2026-10-19)

- No prizes of monetary value; placements and a leaderboard instead.
- Standalone product that can also be included easily in the Seasonal Entertainment website.
- Sized for up to ~200 concurrent players at launch.
- New repository; all code, specs and repo docs in English.
- Original Seasonal Tokens icons, logo and font come from the Seasonal Entertainment website project ([assets/README.md](../../assets/README.md)).

## 3. Proposals in this spec (built as written unless the owner changes them)

| Proposal | Where |
|---|---|
| Season mechanic: four season cells per card (different rows and columns); marking one activates its effect | 01 §4, §8 |
| Default effects: Spring growth, Summer ×1.5 multiplier, Autumn row harvest, Winter cut shield | 01 §8.2 |
| Default match template 100 → 50 → 25 → 13 → final; points-only jackpot | 01 §7, §8.5 |
| Leaderboard period = one calendar quarter named after the season | 01 §10 |
| Commit-reveal seeds so every match is verifiable afterwards | 01 §9 |
| Stack: TypeScript, Fastify, Socket.IO, **PostgreSQL** (not SQLite, because of the Kubernetes/cloud requirement), React | 02 §9 |
| Mandatory TOTP two-factor for all admin roles | 03 §2.1 |

## 4. Decisions (2026-10-19)

| # | Topic | Decision |
|---|---|---|
| D1 | License | AGPL-3.0-or-later, copyright `weudlll-cyber` (same as the race game and the website). |
| D2 | Original Seasonal Tokens logo and icons | The repository was made public on 2026-10-19 with the Seasonal Tokens icons, logo and font included; the same files are already public in the Seasonal Entertainment website repository. See [assets/README.md](../../assets/README.md). |
| D3 | Login when the game runs on the Seasonal Entertainment website | `jwt-handoff`. Checked against the website repository on 2026-10-19: it has its own server-side sessions and its own embed tokens, but no OpenID Connect provider. The website backend will sign a short-lived handoff token for its logged-in user ([07](07-integration-architecture.md) §4). That endpoint is a separate task in the website repository. |
| D4 | Embedding | Only on sites an admin has approved. |
| D5 | Chat on the website | Inside the website the game shows one dedicated room of the website chat (room slug `bingo`, through the website’s `/embed/chat`). Standalone installations use the game’s own chat ([07](07-integration-architecture.md) §6). |
| D6 | Address | The website already decided (2026-10-17) that games live under its main domain at `/games/<name>`. The game therefore runs at `/games/bingo` on the website’s domain; a subdomain remains possible because the build contains no address and the base path is a setting ([09](09-deployment-architecture.md) §1). |

## 4a. Decisions (2026-10-20)

| # | Topic | Decision |
|---|---|---|
| D7 | Card and ball labels | Every column ascends top to bottom in all game types, under the letters B I N G O; a drawn number shows its letter (“G 52”), a season symbol its season ([01](01-game-design.md) §4, §5). |
| D8 | Draw control | Timed draws or host draws (“Draw next”), switchable at any time during a match; the draw sequence does not change ([01](01-game-design.md) §5). |
| D9 | Missed numbers | When players tap, a drawn number they did not tap is marked for them after N seconds without bonus (default 3), or left open until tapped; chosen at creation ([01](01-game-design.md) §6). |

## 4b. Decisions (2026-10-21)

| # | Topic | Decision |
|---|---|---|
| D10 | Last number and classic prizes | A round's last number stays tappable inside its speed window; a classic prize is decided when the window of the draw that first completes it closes and goes to everyone who has it by then ([01](01-game-design.md) §3a.1, §6). |
| D11 | Royale multiplier | The royale default stages use the stage multiplier 1 ([01](01-game-design.md) §7.2). |
| D12 | Shortest timed-draw interval | 1 s longer than the match's longest tap time (speed window, or the missed-number delay when “mark after N s” is chosen); enforced in the create form, the host's live seconds field and the server ([01](01-game-design.md) §5). |
| D13 | Host draws | Draw next stays locked for the match's timed interval since the last draw and shows the remaining seconds; the server refuses an early draw ([01](01-game-design.md) §5). |
| D14 | Pause between royale rounds | Chosen at creation: wait N seconds (default 6, minimum 3) or the host starts the next round ([01](01-game-design.md) §7.1). |
| D15 | Cut screen button | “Keep playing” for a survivor, “Watch” for an eliminated player ([01](01-game-design.md) §13). |
| D16 | Start time | A set start time is an announcement; the host can always start the match. “Start automatically at the start time” (default off, switchable in the console until the start) starts it at that time with at least `minPlayers` players (2, D18); with fewer the match waits and the console says so ([01](01-game-design.md) §7.6). |
| D17 | Match ended without a result | Its own end page for host and players: the reason in plain words and who ended it (“by the host” or “by the system”), “Back to the lobby” (everyone) and “Host another match” (host); never the live arena ([01](01-game-design.md) §13). |

## 4c. Decisions (2026-10-23)

| # | Topic | Decision |
|---|---|---|
| D18 | Players needed to start | 2, read from the ruleset's `lobby.minPlayers` by Start and by the automatic start ([01](01-game-design.md) §7.6). |

## 5. Open

The open questions and work are listed in [docs/OPEN.md](../OPEN.md) (short) and [docs/BACKLOG.md](../BACKLOG.md) (full). Needed from the website repository, for Phase 6 only: the handoff endpoint (D3), the `bingo` chat room (D5) and the embeddable call view.
