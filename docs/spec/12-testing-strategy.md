# 12 — Testing Strategy

> Part of the Seasonal Bingo Royale specification. Index: [README](README.md).

## 1. Principles

- The rules engine is pure, so it is tested exhaustively and fast; infrastructure is tested with real Postgres; the UI is tested with a small set of end-to-end journeys plus component tests.
- Run only the checks a change can affect: CI selects jobs by changed paths (domain change → domain + application + integration; docs-only change → docs job only).
- Every bug fix starts with a test that fails before the fix.
- Measurements and load tests are short and direct; no multi-hour soak runs.

## 2. Test pyramid

| Level | Tool | Scope | Target |
|---|---|---|---|
| Unit | Vitest | `domain` (cards, draws, scoring, seasons, cuts, tie-breaks, jackpot, decide/evolve), `contracts` (schema edge cases), client hooks/utilities | domain ≥ 95 % lines and branches; application ≥ 85 % |
| Property-based | fast-check | Invariants (§3) over random seeds, rulesets and player counts | 1 000 cases per property in CI |
| Integration | Vitest + Testcontainers (Postgres 17) | Repositories, migrations, use cases end-to-end through adapters, scheduler with fake clock, WS gateway with real Socket.IO clients | every use case ≥ 1 happy + 1 failure path |
| Contract | Vitest | Every HTTP route and WS message validated against `contracts`; OpenAPI generation succeeds; problem-details shape | 100 % of routes |
| Component | Vitest + Testing Library | Card grid, season indicators, standings table, admin forms generated from schemas | key components |
| E2E | Playwright (Chromium, Firefox, WebKit mobile) | Journeys in §4 | all green before merge to master |
| Load | k6 (+ socket.io k6 extension or a Node load driver) | §5 | before every release |
| Security | ZAP baseline, header test, authz matrix test, dependency scans | §6 | every PR (fast parts), every release (ZAP) |

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
12. Classic types (`classicSeasons`, `classic`): a prize is awarded exactly once per `(round, prize, account)`; every ticked prize is awarded before the round ends; the round ends on the draw that awards the last outstanding prize (or earlier only when the pool is exhausted); every simultaneous completion on that draw is in the award set.
13. `classicSeasons` cards: four season cells carry a season symbol in place of a number; the twenty number cells still obey the B-I-N-G-O column ranges; drawing the symbol marks the symbol cell on every card and never a number cell.
14. `classicSeasons` draw sequence is a permutation prefix of 79 items (75 numbers + 4 symbols); `classic` of 75 numbers; `royale` of 75 numbers.

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
- Test accounts and data created by a test are removed by the test (Testcontainers DB per test file; E2E uses a dedicated DB reset endpoint enabled only in test builds).
- E2E tests target the project's fixed local ports: server **3900**, player client **5390**, admin client **5391** (08 §1.1). Playwright `baseURL` points at `http://127.0.0.1:5390`; the admin spec switches to `5391`.

## 8. Manual acceptance (owner)

Every work package that changes something visible ends with what the owner looks at in the browser, which seed (the dev build offers a **Quick Test** panel with a seed field that starts a single-player match against bots), and what “correct” looks like. Nothing visible is merged before that check.
