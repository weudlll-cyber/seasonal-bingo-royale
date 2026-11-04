# Morning sheet

What the night chain (PERF-TAPS, then WEBSITE-INTEGRATION-2, then INSTALL-AUTO) did, what runs, what is open and what needs the owner's word. Regenerated after every finished piece.

## Done

- (none merged yet in this chain)

## Running

- PERF-TAPS (branch perf/taps): code, tests, measurement and docs done; pull request and merge next. Tap acknowledgement p95 194 ms → 90 / 144 ms on the rehearsal machine (target < 150 ms), all other targets met (docs/spec/12-testing-strategy.md §5).

## Open

- WEBSITE-INTEGRATION-2: piece A (feat/website-users), piece B (feat/open-rounds)
- INSTALL-AUTO (feat/install-auto)

## Needs the owner's word

- PERF-TAPS: "a draw is never delayed by taps" is read as: a draw waits at most for the one batch already being stored (taps and draws share the match's queue in arrival order, so no tap is reordered against a draw).
