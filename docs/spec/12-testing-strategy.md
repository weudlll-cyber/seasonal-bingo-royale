# 12 — Testing Strategy

> Part of the Seasonal Bingo Royale specification. Index: [README](README.md).

## 1. Principles

- The rules engine is pure, so it is tested exhaustively and fast; infrastructure is tested with real Postgres; the UI is tested with a small set of end-to-end journeys plus component tests.
- Run only the checks a change can affect while working; CI runs every job on every push (as built: no selection by changed paths, a full run takes a few minutes, 08 §3).
- Every bug fix starts with a test that fails before the fix.
- Measurements and load tests are short and direct; no multi-hour soak runs.

## 2. Test pyramid

| Level | Tool | Scope | Target |
|---|---|---|---|
| Unit | Vitest | `domain` (cards, draws, scoring, seasons, cuts, tie-breaks, jackpot, decide/evolve), `contracts` (schema edge cases), client hooks/utilities | domain ≥ 95 % lines and ≥ 85 % branches; application ≥ 85 % lines and branches |
| Property-based | fast-check | Invariants (§3) over random seeds, rulesets and player counts | 1 000 cases per property in CI |
| Integration | Vitest + Testcontainers (Postgres 17) | Repositories, migrations, use cases end-to-end through adapters, scheduler with fake clock, WS gateway with real Socket.IO clients | every use case ≥ 1 happy + 1 failure path |
| Contract | Vitest | Every HTTP route and WS message validated against `contracts`; OpenAPI generation succeeds; problem-details shape | 100 % of routes |
| Component | Vitest + Testing Library | Card grid, season indicators, standings table, admin forms generated from schemas | key components |
| E2E | Playwright (Chromium, Firefox, WebKit mobile) | Journeys in §4 | all green before merge to master |
| Load | k6 (+ socket.io k6 extension or a Node load driver) | §5 | before every release |
| Security | ZAP baseline, header test, authz matrix test, dependency scans | §6 | every PR (fast parts), every release (ZAP) |

Built so far: CI runs `pnpm test:coverage` (domain and application, thresholds in `vitest.config.ts` at the targets above) and, in the job `coverage-integration`, `pnpm test:integration:coverage`: the server code its integration tests reach, per file and in total (`vitest.integration.config.ts`; a report, no threshold yet). The server's integration tests are their own Vitest project (`@sbr/server:integration`): one file at a time, 60 s per test and 180 s per hook, beside the other projects. Measured 2026-10-24: domain 99.6 % lines, 85.4 % branches; application 98.9 % lines, 91.4 % branches. The domain's branch target is 85 % (decided 2026-10-26; it was 95 %, the lines target is unchanged), because the branches that remain uncovered are unreachable safety guards: of the 98 uncovered domain and application branches, 58 are index and `undefined` guards that strict indexing (`noUncheckedIndexedAccess`) forces, 11 refuse a command at the wrong moment behind the engine's own check, and the rest are defensive paths (the engine's "the domain produced nothing", a draw racing a round end, the DRBG's rare rejection branch, a pool exhausted before every card is complete, which the default rules cannot reach). Every reachable rule among them has a test; covering the guards would need tests that state no rule. The authorization matrix (`apps/server/test/authzMatrix.integration.test.ts`) covers every HTTP route and WS intent for anonymous, guest, player, another host and the host, plus CSRF per route group; an allowed caller never meets a server error (5xx, or `INTERNAL` on the socket); a route or intent missing from it fails the test.

## 3. Domain invariants (property tests)

1. A card has 24 distinct numbers (+ free center) in the correct column ranges; season cells are in 4 distinct rows and 4 distinct columns, never the center.
2. Same seed + same ruleset ⇒ identical cards and draw order (determinism); different round index ⇒ independent sequences.
3. Draw sequence of a round is a permutation prefix of 1–75; no repeats.
4. A player’s score equals the sum of all scoring events in the log (replay = live).
5. A pattern scores at most once per card per round.
6. Season Complete triggers exactly once per player per match, iff all four season bits are set.
7. Cuts: survivors = rule result ∪ shield saves, never below `minSurvivors`, never removes a player ranked above a survivor (except shield saves, which only add).
8. Final ranking is a total order over all entrants; places are 1..N without gaps.
9. Effects: durations never negative; non-stacking rule respected; multipliers apply after growth.
10. Jackpot claimed at most once; value = base + growth × unclaimed rounds.
11. Commitment: `sha256(seed)` equals the published commitment; verification bundle recomputes identical results.
12. Classic types (`classicSeasons`, `classic`): a prize is awarded exactly once per `(round, prize, account)`; every ticked prize is awarded before the round ends; a prize goes to every player who completes it before the speed window of the draw that first completed it closes, and to nobody after; the round ends when the window of the draw that decides the last outstanding prize closes (or of the last draw when the pool is exhausted).
13. `classicSeasons` cards: four season cells carry a season symbol in place of a number; the twenty number cells still obey the B-I-N-G-O column ranges; drawing the symbol marks the symbol cell on every card and never a number cell.
14. `classicSeasons` draw sequence is a permutation prefix of 79 items (75 numbers + 4 symbols); `classic` of 75 numbers; `royale` of 75 numbers.
15. Column order (01 §4): in every game type, the numbers of each column are strictly ascending from top to bottom; season cells and symbol cells keep their positions.
16. Draw control (01 §5): switching between `auto` and `host`, or changing the interval, at any point never changes the draw sequence of the match.
17. Missed-number rule (01 §6): a speed bonus is earned only by a tap inside the speed window; under `autoMarkAfter` an untapped drawn number is marked without bonus exactly when the delay has passed; under `noAutoMark` it stays open and counts for no pattern, season or Season Complete until tapped; no tap is accepted after the round ends.
18. Bots and players in `auto` marking mode mark every drawn number on the draw; human players in `manual` mode never get a mark they did not tap except by `autoMarkAfter`.
19. Round end (D10): no round ends before the speed window of its last draw has closed; a tap on that last number inside its window is accepted.

**Case counts.** Properties over single functions (cards, draws, cuts, effects) run 1 000 cases in CI and 100 locally (`FAST_CHECK_RUNS` overrides). Properties that simulate a whole match (invariants 4, 5, 10, 12 in `packages/domain/src/match/match.properties.test.ts` and `royale/royale.properties.test.ts`) are capped at 50 cases also in CI: one case plays a complete match (up to 20 players, all rounds), about 0.1–0.5 s, so 1 000 cases would add several minutes per property to every push; 50 random seeds per push still vary across pushes, because fast-check draws a new seed each run. The draw-control property (invariant 16, `packages/application/src/match/drawControl.properties.test.ts`) plays part of a match per case and runs 30. Invariant 19 and the last clause of 17 (`packages/domain/src/match/roundEnd.properties.test.ts`) replay 8 small matches per game type and ask the domain at every draw and round end, under a second in all; the time-dependent rest of 17 and invariant 18 are covered by example tests (`missedNumbers.test.ts`, `quicktestMarking.test.ts`).

## 4. E2E journeys

1. Register → verify e-mail (Mailpit) → login → join a realtime match → mark numbers manually → see score, season activation, pattern → survive a cut → finish → see placement and leaderboard update.
2. Async match: join, close the browser, advance server time (test hook available only in test builds), return → “While you were away” summary is correct.
3. Elimination: player eliminated → becomes spectator, can still chat, cannot mark.
4. Guest: can watch and read chat, cannot join or post.
5. Admin: login with 2FA → create ruleset draft → change Winter effect → simulate → publish → create match from it → match uses new rules; running match unaffected.
6. Moderation: player posts filtered word (masked), spam burst (rate-limited), moderator temp-mutes → player sees mute state and expiry.
7. Integration: OIDC login against a test provider (e.g. a containerised Keycloak or `oidc-provider` mock) → no second account; JWT handoff from a test host page → embedded iframe logs in; origin not on allowlist → rejected.
8. Reconnect: kill the socket mid-round → client resyncs without duplicate marks.
9. Accessibility: axe checks on lobby, match, leaderboard, admin forms; keyboard-only manual marking.

**Status (2026-10-23).** Built and covered: journey 1 without e-mail verification and the leaderboard (`e2e/account.spec.ts`, `e2e/realGame.spec.ts`, the acceptance play-through below), journey 8 (`e2e/realGame.spec.ts`: offline for two draws, taps before and after, one mark per cell on the server). Waiting for unbuilt features: journey 1's e-mail verification (WP-09 remainder) and leaderboard update (WP-15); journey 2 (asynchronous matches, WP-14); journeys 3 and 4 in their chat parts (WP-17; watching and the eliminated player's screen are covered by the play-through); journey 5 (admin app, WP-19–WP-21); journey 6 (moderation, WP-18); journey 7 (OIDC and JWT handoff, WP-24/WP-25); journey 9's axe checks (with WP-29; keyboard marking is covered by `apps/web/src/components/cardView.test.tsx`).

**Real-game acceptance play-through (development).** A host and three players (one at 390×844) play six matches — royale, classicSeasons with the default prizes, classic with fullCard; timed and host draws — and every screen is checked on every draw. It uses a **fast test profile** that exists only in development builds: 8 players per match, a short royale (one round per stage, 12 draws per round, a final that ends at the first completed row) and timed draws at the shortest interval D12 allows; the published default rulesets and the game rules are unchanged (a test proves it). The six matches run three at a time. On every draw each screen's numbers are compared with the server's event log (the start of its current round) and each player's points with the server's at the same event number, not by timing. In the royale match where the host starts each next round, every pause checks that the host and every player — also one already out — see the round recap and that it moves no standings and no points (D20); `e2e/acceptance/interludeScreens.spec.ts` saves every recap card for host and player in both themes at both sizes, and `e2e/acceptance/pauseScreens.spec.ts` a timed pause (D21: "Start next round now", no Draw next, "Round over" for the player) before the host ends it early. Each of its checks was shown to catch a fault (NIGHT-6, one match per break): a Draw next that stops drawing, a ticker that drops a number, late taps refused, missed numbers auto-marked at once (caught only after the check was made to watch a missed cell from its draw on), points off by one per mark, and in the Quick Test acceptance a round end shown with its last draw (D10).

## 5. Load test (release gate)

Scenario `royale-200`: 200 virtual players in one realtime match (draw interval 3 s, manual marking with realistic tap delays) + 50 spectators + chat at 1 msg/s per 10 users, for one full match (~15 min). Second scenario: 5 parallel matches × 40 players.

Pass criteria on the reference VPS (4 vCPU / 8 GB):
- draw latency p95 < 500 ms, p99 < 1 s
- mark ack p95 < 150 ms
- zero lost or duplicated marks (verified against the event log afterwards)
- app CPU < 50 %, memory < 600 MiB, no error rate above 0.1 %

Headroom check: same scenario at 400 players must stay below 1 s p95 draw latency.

## 6. Security tests

- **Authorization matrix test**: generated from the permission table — every route/WS intent is called with every role; expected allow/deny asserted. New routes fail CI until listed.
- **CSRF**: writes without/with wrong token rejected.
- **Headers**: CSP, HSTS, frame-ancestors, nosniff present with expected values.
- **Rate limits**: login brute force hits back-off; WS mark flood rejected.
- **Input fuzzing**: fast-check arbitrary JSON against every HTTP body and WS message schema → only 4xx, never 5xx.
- **Anti-cheat**: marks on undrawn numbers, other players’ cards, closed rounds, replayed seq → all rejected and counted.
- **Upload**: polyglot images, SVG with scripts, oversized files, wrong magic bytes → rejected or sanitized.
- **SSRF**: provider URLs pointing to private ranges and redirects to them → rejected.
- **JWT**: `alg=none`, wrong `aud`, expired, replayed `jti`, unknown `kid` → rejected.
- **DAST**: ZAP baseline against staging before every release; findings triaged in BACKLOG.md.

## 7. Test data and determinism

- Fixed seeds for all domain tests; the seed of any failing property test is printed and turned into a regular regression test.
- Builders (`aRuleset().withStages(…)`, `aMatch().withPlayers(50)`) in `packages/domain/test/builders` — shared, not duplicated.
- Test accounts created by a test are removed by the test; matches it created are aborted and stay in the database, since the event log is append-only (04 §3.3) (Testcontainers DB per test file; E2E uses a dedicated DB reset endpoint enabled only in test builds).
- Specs whose checks depend on browser timers (speed window, missed-number delay, timed draws) run in their own Playwright projects after all other specs, one test at a time and one browser after another, so no parallel browser delays their timers; their limits stay as the game defines them. Run one of them alone with `--project=<browser>-timing --no-deps`. Vitest runs on half the cores (`maxWorkers: '50%'`), so tests are not starved next to the integration tests' databases.
- E2E tests target the project's fixed local ports: server **3900**, player client **5390**, admin client **5391** (08 §1.1). Playwright `baseURL` points at `http://127.0.0.1:5390`; the admin spec switches to `5391`.

## 8. Manual acceptance (owner)

Every work package that changes something visible ends with what the owner looks at in the browser, which seed (the dev build offers a **Quick Test** panel with a seed field that starts a single-player match against bots), and what “correct” looks like. Nothing visible is merged before that check.
