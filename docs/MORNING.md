# Morning sheet

What the fit audit (branch `docs/fit-audit`, PR #55) did, what runs, what is open and what needs the owner's word. Regenerated after every finished piece. Measurement only: no product code changed.

## Done

- Measuring spec: [e2e/acceptance/fitAudit.spec.ts](../e2e/acceptance/fitAudit.spec.ts) with the probe [e2e/acceptance/fitProbe.ts](../e2e/acceptance/fitProbe.ts); an acceptance spec, so CI and `pnpm verify` skip it.
- Audit: [docs/concepts/fit-audit.md](concepts/fit-audit.md) — 28 screens × 7 window sizes × 3 font sizes = 588 combinations, nothing dropped. 504 have a finding, most from two lines of CSS (the brand subline and the LIVE badge at 12 px). 15 findings with causes, the spectator card comparison, proposed fixes by cause.
- Screenshots (not committed) in `reports/screens/latest/fit-*.jpg`: every finding light and dark, the passing references, `fit-cards-<size>-<12|14|16>.jpg`.
- Earlier, on master: the admin-area decisions and build order (PR #54).

## Running

- Nothing.

## Open

- The fixes for the fit audit (its §5), after the owner's choice below.
- Building the admin area, piece by piece in the order of admin-area.md §9; piece 0 first.

## Needs the owner's word

- The spectator card numbers' floor: today (12–12.8 px), at least 14 px or at least 16 px — fit-audit.md §4 and the `fit-cards-*` screenshots.
- PR #55 is left open for review (not merged).
