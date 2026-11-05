# Morning sheet

What the night chain (PERF-TAPS, then WEBSITE-INTEGRATION-2, then INSTALL-AUTO) did, what runs, what is open and what needs the owner's word. Regenerated after every finished piece.

## Done

- PERF-TAPS — merged `2514c5f` (PR #30). Tap acknowledgement p95 194 ms → 90 / 144 ms on the pinned rehearsal machine (target < 150 ms); draw on screen p95 142 / 182 ms, gaps p95 4.1 / 4.2 s, lag p99 52 / 127 ms; one round trip per tap batch (was 8); about 16 KiB per socket per draw (was 25). docs/spec/12-testing-strategy.md §5.
- Master fix 1 — merged `9dc4aaf` (PR #31): the equivalence test counts a gap once while it is caught up.
- Master fix 2 — merged `4f0ac17` (PR #32): a late load never puts an older match into the runner's cache (a join after `create` could meet a version conflict; e2e asyncMatch journey 2). Master CI and CodeQL green.

- WEBSITE-INTEGRATION-2 piece A — merged `95b8a99` (PR #33): website guests, Can-Host, Discord steps, account-changes feed, 7-day sessions; the throw-away Ubuntu test passed in nginx mode (27 checks) and own-Caddy mode (26). Master CI and CodeQL green.

- WEBSITE-INTEGRATION-2 piece B — merged `938a059` (PR #34): the host's "Show on the Seasonal Entertainment website" and GET <base>api/public/open-rounds (docs/OPEN-ROUNDS.md). Master CI green after one re-run (a webkit-mobile timing failure in playerFit, unrelated, green on the re-run); CodeQL green. Play-through on master: account, real game and website login specs in Chromium, 7 of 7 passed.

- INSTALL-AUTO — merged `95cd902` (PR #35): one command installs the game embedded in the website (the website's record, the route file applied with a rollback, final checks through the proxy; the manual steps only a fallback). Throw-away Ubuntu test: nginx mode 38 checks, own Caddy 37 checks, all passed (BINGO=no stops before any change, a broken route file rolled back, re-run, uninstall). Master CI and CodeQL green.
- Only `master` is left on origin. The dev server runs on master (3900 / 5390) with the demo league.

## Running

- Nothing.

## Open

- Nothing in this chain.

## Needs the owner's word

- PERF-TAPS: "a draw is never delayed by taps" is read as: a draw waits at most for the one batch already being stored (taps and draws share the match's queue in arrival order, so no tap is reordered against a draw).
- Piece A: a write without a game session is refused with 403 by the CSRF check before the route's 401 (the task says 401). Both refuse; the order was left as it is (a security check). Say if 401 is wanted first.
- Piece A: a deleted website account shows as "deleted player xxxx" (the existing deletion naming with a short tag that keeps several apart), not exactly "Deleted player".
- Piece A: website visitors without a session get a watch-only guest session automatically (live watching needs a session on the socket); standalone keeps its behaviour (signed-out visitors load the match once, no live updates). Say if standalone should do the same.
- Piece A: the first `sbr update` after this version still runs the old CLI, which does not read the sync token yet; the token is read at install and from the second update on (or re-run the installer).
- INSTALL-AUTO: the test machines use the website's record and file layout as its installer writes them (install.conf, the include folder, the checkout's deploy/site/routes mounted into Caddy), not the website installer itself: running it needs its full stack and certificates. Say if a run with the real website installer is wanted before the move.
- Website side: the games page link and the open-rounds widget are still to do there.
