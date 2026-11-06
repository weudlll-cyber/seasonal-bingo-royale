# 12 — Testing Strategy

> Part of the Seasonal Bingo Royale specification. Index: [README](README.md).

## 1. Principles

- The rules engine is pure, so it is tested exhaustively and fast; infrastructure is tested with real Postgres; the UI is tested with a small set of end-to-end journeys plus component tests.
- Run only the checks a change can affect while working; CI runs every job for every pull request to `master` and every push to `master` (as built: no selection by changed paths, a full run takes a few minutes, 08 §3). Before a push, the specs that read what the commit changed run locally first (CLAUDE.md).
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

Built so far: CI runs `pnpm test:coverage` (domain and application, thresholds in `vitest.config.ts` at the targets above) and, in the job `coverage-integration`, `pnpm test:integration:coverage`: the server code its integration tests reach, per file and in total (`vitest.integration.config.ts`; a report, no threshold yet). The server's integration tests are their own Vitest project (`@sbr/server:integration`): one file at a time, 60 s per test and 180 s per hook, after the other projects (the server's unit tests are its folder project, `apps/server/vitest.config.ts`). Measured 2026-10-24: domain 99.6 % lines, 85.4 % branches; application 98.9 % lines, 91.4 % branches. The domain's branch target is 85 % (decided 2026-10-26; it was 95 %, the lines target is unchanged), because the branches that remain uncovered are unreachable safety guards: of the 98 uncovered domain and application branches, 58 are index and `undefined` guards that strict indexing (`noUncheckedIndexedAccess`) forces, 11 refuse a command at the wrong moment behind the engine's own check, and the rest are defensive paths (the engine's "the domain produced nothing", a draw racing a round end, the DRBG's rare rejection branch, a pool exhausted before every card is complete, which the default rules cannot reach). Every reachable rule among them has a test; covering the guards would need tests that state no rule. The authorization matrix (`apps/server/test/authzMatrix.integration.test.ts`) covers every HTTP route and WS intent for anonymous, guest, player, another host and the host, plus CSRF per route group; an allowed caller never meets a server error (5xx, or `INTERNAL` on the socket); a route or intent missing from it fails the test.

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
7. Integration: the website login (D37) — built: `apps/server/test/websiteLogin.integration.test.ts` (account by issuer and subject, name and roles following the website, e-mail verification, forged headers from an untrusted peer, on another route or in local mode sign nobody in), `apps/server/test/websiteRules.integration.test.ts` (organiser and admin host, a website admin is a game admin until the website drops the role, never super_admin; deletion by name in website mode, by password in local mode; the return path through the website login and the rejected ones; no sign-in without the proxy secret; D40–D43), `e2e/websiteLogin.spec.ts` (a website-mode server behind a stand-in of the website's proxy: sign in through the website and back to the page, a short counting match, league points only with a verified e-mail, forged headers rejected, also sent to the app directly without the secret; accounts removed by name) and `ops/test/website-vps.sh` (the install in nginx and own-Caddy mode in a throw-away Ubuntu 24.04 machine with a stub authorize endpoint: the secret made, kept private and never sent to the website, the way back to the page, the website admin, forged headers past the proxy refused). Later options: OIDC login against a test provider (e.g. a containerised Keycloak or `oidc-provider` mock) → no second account; JWT handoff from a test host page → embedded iframe logs in; origin not on allowlist → rejected.
8. Reconnect: kill the socket mid-round → client resyncs without duplicate marks.
9. Accessibility: axe checks on lobby, match, leaderboard, admin forms; keyboard-only manual marking.

**Status (2026-10-23).** Built and covered: journey 1 without e-mail verification and the leaderboard (`e2e/account.spec.ts`, `e2e/realGame.spec.ts`, the acceptance play-through below), journey 8 (`e2e/realGame.spec.ts`: offline for two draws, taps before and after, one mark per cell on the server), journey 2 (`e2e/asyncMatch.spec.ts`: the test hook is the development-only `POST /api/v1/dev/time-travel`, 05 §2.3a, absent from production builds; the summary's draws are compared with the server's log). Waiting for unbuilt features: journey 1's e-mail verification (WP-09 remainder) and leaderboard update (WP-15); journeys 3 and 4 in their chat parts (WP-17; watching and the eliminated player's screen are covered by the play-through); journey 5 (admin app, WP-19–WP-21); journey 6 (moderation, WP-18); journey 7 (OIDC and JWT handoff, WP-24/WP-25); journey 9's axe checks (with WP-29; keyboard marking is covered by `apps/web/src/components/cardView.test.tsx`).

**Real-game acceptance play-through (development).** A host and three players (one at 390×844) play six matches — royale, classicSeasons with the default prizes, classic with fullCard; timed and host draws — and every screen is checked on every draw. It uses a **fast test profile** that exists only in development builds: 8 players per match, a short royale (one round per stage, 12 draws per round, a final that ends at the first completed row) and timed draws at the shortest interval D12 allows; the published default rulesets and the game rules are unchanged (a test proves it). The six matches run three at a time. On every draw each screen's numbers are compared with the server's event log (the start of its current round) and each player's points with the server's at the same event number, not by timing. In the royale match where the host starts each next round, every pause checks that the host and every player — also one already out — see the round recap and that it moves no standings and no points (D20); `e2e/acceptance/interludeScreens.spec.ts` saves every recap card for host and player in both themes at both sizes, and `e2e/acceptance/pauseScreens.spec.ts` a timed pause (D21: "Start next round now", no Draw next, "Round over" for the player) before the host ends it early. Each of its checks was shown to catch a fault (NIGHT-6, one match per break): a Draw next that stops drawing, a ticker that drops a number, late taps refused, missed numbers auto-marked at once (caught only after the check was made to watch a missed cell from its draw on), points off by one per mark, and in the Quick Test acceptance a round end shown with its last draw (D10).

## 5. Load test (release gate)

Scenario `royale-200`: 200 virtual players in one realtime match (draw interval 3 s, manual marking with realistic tap delays) + 50 spectators + chat at 1 msg/s per 10 users, for one full match (~15 min). Second scenario: 5 parallel matches × 40 players.

Pass criteria on the reference VPS (4 vCPU / 8 GB):
- draw latency p95 < 500 ms, p99 < 1 s
- mark ack p95 < 150 ms
- zero lost or duplicated marks (verified against the event log afterwards)
- app CPU < 50 %, memory < 600 MiB, no error rate above 0.1 %

Headroom check: same scenario at 400 players must stay below 1 s p95 draw latency.

**Measured 2026-11-04** (the production image built with `--build-arg SBR_BUILD_DEV=1` so the load accounts can sign in, `SBR_DEV=1` on localhost, the compose file's limits, Docker Desktop on the owner's Windows PC with the load generator on the same machine; `load/drawLatency.mjs 200 50 1`, `load/asyncJump.mjs 200`): 200 players in one realtime royale (fast profile, draws every 4 s, every player taps its numbers), 50 spectators.

| Value | First run | After the fixes | Criterion |
|---|---|---|---|
| Gap between draws in a round (4 s planned) | 20 s – 2 min | p50 4.12 s, p95 4.23 s | (none named) |
| Draw-to-screen latency, players | — (run crashed at the end) | p50 42 ms, p95 97 ms, p99 161 ms | pass |
| Draw-to-screen latency, spectators | — | p50 78 ms, p95 160 ms, p99 206 ms | pass |
| Tap acknowledgement | dev run: p95 23 s | p50 534 ms, p95 916 ms | **fail** (p95 < 150 ms) |
| App CPU / memory peak | 2.69 CPUs / 322 MiB | 1.99 CPUs (its limit) / 328 MiB | memory pass; CPU over 50 % of the PC |
| PostgreSQL CPU / memory peak, connections | 1.37 CPUs / 79 MiB, 11 | 0.78 CPU / 79 MiB, 12 | (none named) |
| Errors | — | 0 | pass |
| Lost or duplicated marks | — | 1477 accepted taps = 1477 manual marks in the log and the marks table, no cell twice in a round | pass |
| Async royale, 200 players: "jump ahead 1 day" | 7.4 s | 5.5 s | (none named) |
| … then all 200 away summaries at once | p95 64 s | p95 0.8 s | (none named) |

Fixes (each measured again): a mark rewrites only its player's standings row (all 200 before); taps waiting in the match's queue are applied in one batch, timed on arrival; a snapshot at most once per draw (every 25 events before); the away summaries share one log read and one replay per seen seq. Open: the tap acknowledgement p95 (next steps in BACKLOG), the 400-player headroom check, the chat part of the scenario (chat is not built).

**On a production install (2026-11-04):** `sudo sbr loadcheck` runs the same check against the install itself, without development code ([09](09-deployment-architecture.md) §4): 200 players, 50 spectators, one realtime royale with the published defaults (draws every 4 s; the fast profile is development-only), at most 10 minutes; its temporary accounts are removed afterwards. Rehearsed on the throw-away Ubuntu 24.04 machine on the owner's PC (Docker inside Docker, the generator on the same machine), 200 players and 50 spectators for 10 minutes of the published royale. Draw to screen p50 115 ms, p95 736 ms, p99 1001 ms (spectators p95 1072 ms); tap acknowledgement p50 594 ms, p95 1984 ms; gaps between draws p95 6.2 s; app event-loop lag up to 7.2 s; app 1.44 CPUs / 104 MiB, PostgreSQL 1.28 CPUs / 80 MiB at their peaks; 0 errors; all 251 accounts removed. The published royale's 40-draw rounds with the full field load the server more than the fast profile measured above, and draw latency now fails its p95 too: the owner runs the check once on the VPS after the install, and the tap acknowledgement is broken down below.

**Tap acknowledgement broken down (2026-11-04, perf/tap-ack):** `sbr loadcheck` now prints where a tap's time goes on the server (08 §6). Three runs of 200 players and 50 spectators, 5 minutes each, on the rehearsal machine:

| Per tap (mean) | Before | After the lookup fix (two runs) |
|---|---|---|
| Gateway lookup of the match code (a database query) | 122 ms | 0 ms, 0 ms |
| Wait for the batch | 220 ms | 304 ms, 288 ms |
| Batch: decide / append (transaction) / publish | 2 / 371 / 0 ms | 2 / 392 / 0 ms, 9 / 438 / 0 ms |
| Whole tap on the server | 860 ms | 956 ms, 944 ms |
| Tap acknowledgement at the client, p50 / p95 | 938 / 1978 ms | 1060 / 2795 ms, 984 / 3195 ms |
| App event-loop lag, p99 max | 1.6 s | 2.1 s, 6.4 s |

The gateway now keeps each match code once. A code never changes and a match is never deleted, so this removed the lookup and about 64 database queries per draw, and the speed bonus's receive time now comes right at arrival. On this machine the acknowledgement end to end did not get shorter. The rest, the wait for the batch and the transaction, follows the app's busy event loop: up to seconds of lag while 250 screens fetch after every draw. The next step is the larger change named in BACKLOG (fewer fetches per draw, room frames coalesced), not a small fix.

**One live update per step (2026-11-04, PERF-FANOUT, 06 §8).** The same harness, now pinned: the load generator on its own CPUs (`sbr loadcheck --cpuset 6-11`), the app on CPUs 0–3 and PostgreSQL on 4–5 (`docker update --cpuset-cpus`) on the 14-CPU rehearsal machine. 200 players all tapping and 50 spectators, the published royale with draws every 4 s, 5 minutes per run. "Draw on screen" is when a screen has everything to show the draw: before, after its state fetch; after, when its own frame has followed the room frame.

| Measure | Before (fetch per screen) | After, run 1 | After, run 2 | Target |
|---|---|---|---|---|
| Draw on screen, p50 / p95 / p99 | 2811 / 4101 / 4843 ms | 104 / 291 / 554 ms | 127 / 369 / 537 ms | p95 < 500 ms, p99 < 1 s ✓ |
| Room frame arrives (players), p95 | 928 ms | 197 ms | 275 ms | |
| Tap acknowledgement, p50 / p95 | 854 / 2429 ms | 33 / 313 ms | 85 / 418 ms | p95 < 150 ms ✗ |
| Whole tap on the server, mean (wait / transaction) | 872 ms (252 / 479) | 53 ms (16 / 29) | 87 ms (22 / 45) | |
| Gaps between draws, p95 | 6452 ms | 4215 ms | 4245 ms | ≤ 4.3 s ✓ |
| App event-loop lag, p99 max | 1898 ms | 162 ms | 192 ms | < 200 ms ✓ |
| State fetches per draw | 341 | 0 | 0.2 | |
| Building per draw (fetch answers + frames) | 1033 + 177 ms | 0 + 68 ms | 0 + 103 ms | |
| Bytes per draw (fetch answers + frames × recipients) | 5456 + 2558 KiB | 1 + 6333 KiB | 10 + 6848 KiB | |
| App / PostgreSQL peak | 1.54 / 1.31 CPUs | 1.02 / 0.53 CPUs | 1.14 / 0.84 CPUs | |
| Errors | 21 (taps pending when the run closed its sockets) | 0 | 0 | ✓ |

The tap acknowledgement still misses its target, in the tail. Its median fell from 854 ms to 33–85 ms, but the p95 is 313–418 ms. On the server a tap's mean is now 53–87 ms: the wait for the batch plus the batch's transaction, whose p95 reaches the 100–250 ms histogram bucket. The next cause is the per-batch transaction: about seven round trips (lock, insert events, version, projections, commit), with taps that arrive meanwhile waiting the whole of it. The rest is the transport and the load generator's own single event loop for 250 sockets. Next steps are in BACKLOG. The bytes per draw are about a quarter lower in total but now all in frames (about 25 KiB per socket per draw): each step repeats `rankedIn` (200 names) and the summary.

**Lighter tap batches and leaner frames (2026-11-04, PERF-TAPS, 06 §8).** The same pinned harness and scenario as PERF-FANOUT, one run on master before, two after. A batch of taps (and a draw or a window close) is now one statement: the version move `UPDATE … WHERE version = expected RETURNING id` heads data-modifying CTEs that insert the events and write the read models, so the batch is one round trip instead of eight (a join, the finish and a batch with a snapshot still run in a transaction). Taps that arrive while a batch is stored form the next batch at once (as before, now with a test). The room frame leaves out the summary and `rankedIn` when unchanged.

| Measure | Before (master) | After, run 1 | After, run 2 | Target |
|---|---|---|---|---|
| Tap acknowledgement, p50 / p95 / p99 | 33 / 194 / 347 ms | 18 / 90 / 127 ms | 24 / 144 / 227 ms | p95 < 150 ms ✓ |
| Whole tap on the server, mean (wait / transaction) | 45 ms (15 / 25) | 19 ms (6 / 10) | 28 ms (6 / 14) | |
| Wait for the batch, p95 bucket | ≤ 100 ms | ≤ 25 ms | ≤ 25 ms | |
| Batch transaction, p95 bucket | ≤ 100 ms | ≤ 50 ms | ≤ 100 ms | |
| Taps per batch, mean | 16.9 | 14.9 | 14.9 | |
| Round trips per tap batch | 8 (counted in the test) | 1.0 | 1.0 | |
| Draw on screen, p50 / p95 / p99 | 103 / 232 / 313 ms | 87 / 142 / 174 ms | 98 / 182 / 362 ms | p95 < 500 ms ✓ |
| Gaps between draws, p95 | 4241 ms | 4116 ms | 4190 ms | ≤ 4.3 s ✓ |
| App event-loop lag, p99 max | 92 ms | 52 ms | 127 ms | < 200 ms ✓ |
| Frames per draw: building / bytes × recipients | 60 ms / 6247 KiB | 38 ms / 3972 KiB | 50 ms / 4129 KiB | |
| Bytes per socket per draw | about 25 KiB | about 16 KiB | about 16.5 KiB | |
| App / PostgreSQL peak | 1.37 / 0.64 CPUs | 0.86 / 0.48 CPUs | 1.38 / 0.55 CPUs | |
| Errors | 0 | 0 | 0 | ✓ |

The tap acknowledgement meets its target in both runs; run 2's p95 (144 ms) is close to it, so the margin is small. The p99 of the gaps (about 22 s) is the pause after the round end, not a slow draw. The next cause in the tail is the transaction itself in the 50–100 ms bucket under load and the load generator's single event loop for 250 sockets.

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

- Quiet runs (2026-11-06): `pnpm test:quiet`, `pnpm verify:quiet` and `pnpm e2e:quiet` use dot reporters, so a run prints its failures in full and nothing else of note; the plain scripts keep the full report.
- Tests wait on the server's work, never on time: `App.live.settled(matchId)` resolves once every event of a match went out as a live step, `App.live.seenNow()` writes the seen seqs at once (`apps/server/src/http/app.ts`); the live-steps equivalence test opens its screens on a settled match and allows no gap (2026-11-06).

- Fixed seeds for all domain tests; the seed of any failing property test is printed and turned into a regular regression test.
- Builders (`aRuleset().withStages(…)`, `aMatch().withPlayers(50)`) in `packages/domain/test/builders` — shared, not duplicated.
- Test accounts created by a test are removed by the test; matches it created are aborted and stay in the database, since the event log is append-only (04 §3.3) (Testcontainers DB per test file; E2E uses a dedicated DB reset endpoint enabled only in test builds).
- Specs whose checks depend on browser timers (speed window, missed-number delay, timed draws) run in their own Playwright projects after all other specs, one test at a time and one browser after another, so no parallel browser delays their timers; their limits stay as the game defines them. Run one of them alone with `--project=<browser>-timing --no-deps`. In CI, Chromium's timing specs run alone on their own runner beside the two shards of its regular specs (08 §4). The full suite in all browsers runs in CI only; locally the specs that read a change run in Chromium (CLAUDE.md, Testing). Vitest runs on half the cores (`maxWorkers: '50%'`), so tests are not starved next to the integration tests' databases.
- E2E tests target the project's fixed local ports: server **3900**, player client **5390**, admin client **5391** (08 §1.1). Playwright `baseURL` points at `http://127.0.0.1:5390`; the admin spec switches to `5391`.

## 8. Manual acceptance (owner)

Every work package that changes something visible ends with what the owner looks at in the browser, which seed (the dev build's **Quick Test** page, "Test a match", offers "Play a test match" — a live match with bots, started now or in a few minutes, its host console in a new tab and the test tab as the normal player screen — and "Check a game by seed", a seed simulation that replays a single-player match against bots), and what “correct” looks like. Nothing visible is merged before that check.
