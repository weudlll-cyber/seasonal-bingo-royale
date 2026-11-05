# Morning sheet

What the night chain (PERF-TAPS, then WEBSITE-INTEGRATION-2, then INSTALL-AUTO) did, what runs, what is open and what needs the owner's word. Regenerated after every finished piece.

## Done

- PERF-TAPS — merged `2514c5f` (PR #30). Tap acknowledgement p95 194 ms → 90 / 144 ms on the pinned rehearsal machine (target < 150 ms); draw on screen p95 142 / 182 ms, gaps p95 4.1 / 4.2 s, lag p99 52 / 127 ms; one round trip per tap batch (was 8); about 16 KiB per socket per draw (was 25). docs/spec/12-testing-strategy.md §5.
- Master fix 1 — merged `9dc4aaf` (PR #31): the equivalence test counts a gap once while it is caught up.
- Master fix 2 — merged `4f0ac17` (PR #32): a late load never puts an older match into the runner's cache (a join after `create` could meet a version conflict; e2e asyncMatch journey 2). Master CI and CodeQL green.

## Running

- WEBSITE-INTEGRATION-2 piece A (branch feat/website-users): code, tests and docs done; the throw-away Ubuntu test (nginx and own-Caddy mode) runs; then the pull request and merge.

## Open

- WEBSITE-INTEGRATION-2 piece B (feat/open-rounds), then the play-through in both modes.
- INSTALL-AUTO (feat/install-auto).

## Needs the owner's word

- PERF-TAPS: "a draw is never delayed by taps" is read as: a draw waits at most for the one batch already being stored (taps and draws share the match's queue in arrival order, so no tap is reordered against a draw).
- Piece A: a write without a game session is refused with 403 by the CSRF check before the route's 401 (the task says 401). Both refuse; the order was left as it is (a security check). Say if 401 is wanted first.
- Piece A: a deleted website account shows as "deleted player xxxx" (the existing deletion naming with a short tag that keeps several apart), not exactly "Deleted player".
- Piece A: website visitors without a session get a watch-only guest session automatically (live watching needs a session on the socket); standalone keeps its behaviour (signed-out visitors load the match once, no live updates). Say if standalone should do the same.
- Piece A: the first `sbr update` after this version still runs the old CLI, which does not read the sync token yet; the token is read at install and from the second update on (or re-run the installer).
