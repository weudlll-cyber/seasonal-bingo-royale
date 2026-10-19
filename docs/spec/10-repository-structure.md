# 10 — Repository Structure

> Part of the Seasonal Bingo Royale specification. Index: [README](README.md).

## 1. Layout

```
seasonal-bingo-royale/
├─ README.md                    What it is, quick start, links
├─ CLAUDE.md                    Working rules for Claude Code (short; links into docs/)
├─ LICENSE                      AGPL-3.0-or-later
├─ SECURITY.md                  How to report vulnerabilities
├─ CONTRIBUTING.md              Branching, commits, review checklist link
├─ .editorconfig  .gitattributes  .gitignore  .nvmrc  .npmrc
├─ package.json  pnpm-workspace.yaml  pnpm-lock.yaml
├─ tsconfig.base.json  eslint.config.js  prettier.config.js  vitest.workspace.ts
├─ lefthook.yml  renovate.json
├─ .vscode/                     extensions.json, launch.json, settings.json
├─ .github/
│  ├─ workflows/                ci.yml, release.yml, codeql.yml, load.yml
│  ├─ ISSUE_TEMPLATE/  PULL_REQUEST_TEMPLATE.md (contains the review checklist)
│  └─ CODEOWNERS
├─ assets/                      Source brand assets as delivered (see assets/README.md)
│  ├─ README.md                 Asset manifest: file → purpose → size → licence note
│  ├─ seasons/                  spring.svg, summer.svg, autumn.svg, winter.svg (+ PNG fallbacks)
│  ├─ brand/                    logo, wordmark, favicon sources
│  ├─ fonts/                    Luxora Grotesk (WOFF2)
│  └─ sounds/
├─ packages/
│  ├─ domain/                   Pure game rules — no I/O
│  │  └─ src/
│  │     ├─ card/               generateCard.ts, cardTypes.ts, patterns.ts
│  │     ├─ draw/               drbg.ts, drawSequence.ts
│  │     ├─ scoring/            basePoints.ts, speedBonus.ts, patternScoring.ts
│  │     ├─ seasons/            effectCatalog.ts, applyEffect.ts, seasonComplete.ts
│  │     ├─ royale/             stagePlan.ts, cut.ts, tieBreak.ts, jackpot.ts, finalRanking.ts
│  │     ├─ match/              matchState.ts, commands.ts, events.ts, decide.ts, evolve.ts
│  │     └─ index.ts
│  ├─ application/              Use cases + ports
│  │  └─ src/
│  │     ├─ ports/              Clock, Drbg, EventBus, MatchRepository, IdentityProvider, …
│  │     ├─ match/              commands/*.ts, queries/*.ts
│  │     ├─ identity/  config/  leaderboard/  chat/  notification/  audit/
│  │     └─ index.ts
│  ├─ contracts/                Zod schemas shared by server and clients
│  │  └─ src/  http/  ws/  config/ (ruleset + settings schemas, defaults/)  events/  errors.ts
│  └─ ui/                       Shared React components + design tokens (web + admin)
├─ apps/
│  ├─ server/
│  │  ├─ src/
│  │  │  ├─ main.ts             composition root (wires adapters to ports)
│  │  │  ├─ config/             env.ts
│  │  │  ├─ http/               routes/<context>/*.ts, plugins/ (auth, csrf, rateLimit, problem)
│  │  │  ├─ ws/                 gateway.ts, handlers/*.ts, rooms.ts
│  │  │  ├─ db/                 schema/*.ts, repositories/*.ts, migrations/ (SQL)
│  │  │  ├─ identity/           local/, oidc/, jwtHandoff/, sessions/
│  │  │  ├─ scheduler/          pgScheduler.ts
│  │  │  ├─ security/           crypto.ts, safeHttpClient.ts, uploads/, audit/
│  │  │  ├─ notify/             mailer.ts, webPush.ts
│  │  │  └─ cli/                createSuperAdmin.ts, …
│  │  └─ test/                  integration tests (Testcontainers)
│  ├─ web/                      Player client (also the embed target)
│  │  └─ src/  routes/  features/(lobby, match, leaderboard, profile, chat, auth)  embed/  strings.ts
│  ├─ admin/                    Admin client
│  │  └─ src/  routes/  features/(rulesets, matches, settings, integrations, moderation, accounts, audit)
│  └─ embed-loader/             embed.js (tiny, no deps)
├─ e2e/                         Playwright specs + fixtures
├─ load/                        k6 scenarios
├─ ops/
│  ├─ install.sh  sbr  compose.yml  compose.dev.yml  Caddyfile
│  ├─ backup/  restore-drill.sh  pull-backups.sh  pull-backups.ps1
│  ├─ grafana/  prometheus/  examples/(nginx, traefik)
│  └─ k8s/                      (placeholder README only until scale step 2)
└─ docs/
   ├─ spec/                     This specification (01–15)
   ├─ adr/                      Architecture Decision Records (0001-modular-monolith.md, …)
   ├─ onboarding.md             Developer onboarding
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
