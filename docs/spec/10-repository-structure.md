# 10 — Repository Structure

> Part of the Seasonal Bingo Royale specification. Index: [README](README.md).

## 1. Layout

Paths marked *(planned)* do not exist yet; they arrive with the work package that needs them.

```
seasonal-bingo-royale/
├─ README.md                    What it is, quick start, links
├─ CLAUDE.md                    Working rules for Claude Code (short; links into docs/)
├─ LICENSE                      AGPL-3.0-or-later
├─ SECURITY.md                  How to report vulnerabilities
├─ CONTRIBUTING.md              Branching, commits, review checklist link
├─ .editorconfig  .gitattributes  .gitignore  .nvmrc  .npmrc
├─ package.json  pnpm-workspace.yaml  pnpm-lock.yaml
├─ tsconfig.base.json  eslint.config.js  prettier.config.js  vitest.config.ts (projects)
├─ lefthook.yml  renovate.json
├─ .vscode/                     extensions.json, launch.json, settings.json
├─ .github/
│  ├─ workflows/                ci.yml, release.yml, codeql.yml
│  ├─ actions/setup/            shared job setup (pnpm, Node, install)
│  ├─ PULL_REQUEST_TEMPLATE.md  (contains the review checklist)
│  └─ ISSUE_TEMPLATE/  CODEOWNERS (planned)
├─ assets/                      Source brand assets as delivered (see assets/README.md)
│  ├─ README.md                 Asset manifest: file → purpose → size → licence note
│  ├─ seasons/                  spring.svg, summer.svg, autumn.svg, winter.svg (+ PNG fallbacks)
│  ├─ brand/                    logo, wordmark, favicon sources
│  ├─ fonts/                    Luxora Grotesk (WOFF2)
│  └─ sounds/                   (planned)
├─ packages/
│  ├─ domain/                   Pure game rules — no I/O
│  │  └─ src/
│  │     ├─ card/               generateCard.ts, cardTypes.ts, patterns.ts
│  │     ├─ draw/               drbg.ts, drawSequence.ts, pool.ts
│  │     ├─ scoring/            basePoints.ts, speedBonus.ts, patternScoring.ts
│  │     ├─ seasons/            effectCatalog.ts, applyEffect.ts, seasonComplete.ts
│  │     ├─ royale/             cut.ts, jackpot.ts, finalRanking.ts (stage plan in match/stagePlan.ts)
│  │     ├─ classic/            classicPlacement.ts, prizeCatalogue.ts
│  │     ├─ match/              matchState.ts, commands.ts, events.ts, decide.ts, evolve.ts, simulate.ts, …
│  │     └─ index.ts
│  ├─ application/              Use cases + ports
│  │  └─ src/
│  │     ├─ match/              engine.ts, flow.ts, runner.ts, create.ts, startRules.ts, ports.ts (Clock,
│  │     │                      MatchStore, Scheduler, EventBus), fakes.ts
│  │     ├─ identity/  config/  leaderboard/  chat/  notification/  audit/  (planned)
│  │     └─ index.ts
│  ├─ contracts/                Zod schemas shared by server and clients
│  │  └─ src/  config/ (ruleset schema, prizes, defaults/)  view/ (the client view)
│  │           http/  ws/  events/  errors.ts  (planned)
│  └─ ui/                       Shared React components + design tokens (web + admin)
├─ apps/
│  ├─ server/
│  │  ├─ src/
│  │  │  ├─ main.ts  cli.ts     composition root; operator commands (create-super)
│  │  │  ├─ config/             env.ts, features.ts, seedKey.ts, maintenance.ts
│  │  │  ├─ http/               app.ts, routes/*.ts, plugins/ (problem, security headers)
│  │  │  ├─ auth/               accounts, passwords, sessions, session cookie, rate limits
│  │  │  ├─ realtime/           gateway.ts, intents.ts, inOrder.ts
│  │  │  ├─ match/              runtime, pgMatchStore, pgScheduler, codec, projections, retention
│  │  │  ├─ view/               the client view built from the event log
│  │  │  ├─ db/                 pool.ts, migrator.ts, migrations/ (SQL)
│  │  │  ├─ dev/                Quick Test runner, fast test rulesets (development only)
│  │  │  └─ identity/  security/  notify/  (planned: OIDC, JWT handoff, uploads, mail, push)
│  │  └─ test/                  integration tests (Testcontainers)
│  ├─ web/                      Player client (also the embed target)
│  │  └─ src/  shell/ (frame, router, session)  game/ (lobby, match)  host/  account/
│  │           components/ (Quick Test and shared views)  test/ (fixtures)
│  │           leaderboard/  profile/  chat/  embed/  strings.ts  (planned)
│  ├─ admin/                    Admin client (empty shell until WP-19)
│  │  └─ src/  routes/  features/(rulesets, matches, settings, integrations, moderation, accounts, audit)  (planned)
│  └─ embed-loader/             embed.js (tiny, no deps; empty shell until WP-25)
├─ e2e/                         Playwright specs + fixtures
├─ load/                        drawLatency.mjs (200-player check); k6 scenarios (planned)
├─ ops/
│  ├─ install.sh  sbr  lib/  compose.yml  compose.website.yml  compose.dev.yml  Caddyfile
│  ├─ pull-backups.sh  pull-backups.ps1  (the restore drill is `sbr restore --drill`)
│  ├─ examples/ (nginx, an existing Caddy)  notify.ps1 (development machine only)
│  └─ grafana/  prometheus/  k8s/  (planned)
└─ docs/
   ├─ spec/                     This specification (01–15)
   ├─ adr/  onboarding.md       (planned; CONTRIBUTING.md covers local work today)
   ├─ NIGHT-RUN.md              Unattended runs on the development machine
   ├─ operator-guide.md         Install, update, backup, hardening
   ├─ code-review-checklist.md
   ├─ BACKLOG.md                Part one: open · Part two: closed (with what closed it)
   └─ OPEN.md                   Short page over BACKLOG.md
```

## 2. Size and structure rules (enforced)

| Rule | Limit | Enforced by |
|---|---|---|
| File length | ≤ 300 lines (tests ≤ 400) | ESLint `max-lines` |
| Function length | ≤ 60 lines | ESLint `max-lines-per-function` |
| Cyclomatic complexity | ≤ 12 | ESLint `complexity` |
| Parameters | ≤ 4 (use an object beyond) | ESLint `max-params` |
| Layer dependencies | §3 of [02-software-architecture.md](02-software-architecture.md) | `eslint-plugin-boundaries` |
| No default exports, no `any`, no non-null `!` | — | ESLint + `tsc` strict |
| Unused variables and imports | none | ESLint `no-unused-vars` (TS variant) |

Dead code beyond unused variables, duplication and file headers are not policed by extra tools; they are kept in order by careful work: every change updates code, headers, comments and docs together, and reviews use the checklist in §5 (decided 2026-10-08 for the owner’s projects, applied here).

## 3. Standard file header

Every source file (TS, TSX, SQL, shell, YAML workflow) starts with:

```ts
/**
 * @file   packages/domain/src/royale/cut.ts
 * @module domain/royale
 * @brief  Applies an elimination cut to a ranked field of players.
 *
 * Responsibility: decide who survives a cut according to the stage's cut rule,
 *                 minimum survivors and Winter shield charges. Pure function.
 * Depends on:     ./tieBreak, ../seasons/effectCatalog (types only)
 * Used by:        ../match/decide.ts
 * Spec:           docs/spec/01-game-design.md §7.4
 */
```

`@brief` one line; `Responsibility` max three lines; `Spec` points at the governing section. Header and inline comments are updated in the same commit as the code they describe.

## 4. Naming

- Files: `camelCase.ts` for modules, `PascalCase.tsx` for React components.
- Use case per file: `joinMatch.ts` exports `joinMatch` (command) or `getMatchState` (query).
- Events past tense (`RoundStarted`), commands imperative (`StartRound`).
- Config keys `camelCase` with dotted paths (`seasons.winter.effect`).

## 5. Commits and PRs

- Conventional Commits (`feat(match): …`, `fix(chat): …`, `docs(spec): …`).
- PR template includes the code review checklist (`docs/code-review-checklist.md`):
  1. Matches the spec section it claims; spec updated if behaviour changed.
  2. Domain stays pure; no layer violation.
  3. Inputs validated with contracts; permissions checked; audit entry for admin writes.
  4. No dead code, no duplicate helper (searched for an existing one; reused helpers named in the PR).
  5. Tests: new behaviour covered, including a failing-before test for bug fixes.
  6. File headers and comments current; docs, BACKLOG.md and OPEN.md updated in the same PR.
  7. No secrets, no `console.log`, no TODO without a BACKLOG entry.
  8. Migrations reviewed; backwards compatible with the previous release for rollback.

## 6. CLAUDE.md (content outline)

Short (≤ 80 lines), pointing into docs rather than duplicating them:
- Language: everything in the repo is English.
- Read the spec section before touching a module; cite it in the PR.
- Layer rules, file size limits, header format.
- Run `pnpm verify` before reporting; report lines before/after, what was removed, what was extracted, what was noticed but left alone.
- Never run destructive git commands; never merge unless the task says so; always push the branch.
- Never touch configuration defaults in a way that changes running behaviour without the task saying so.
- Never add dependencies without naming them and the reason in the report.
