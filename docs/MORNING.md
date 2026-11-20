# Morning sheet

What the fit fixes (branch `docs/fit-audit`, PR #55) did, what runs, what is open and what needs the owner's word. Regenerated after every finished piece. Source: [docs/concepts/fit-audit.md](concepts/fit-audit.md) §3 and §5. Owner decisions of 2026-11-20: no text below 14 px at the default font; card numbers never below 16 px; on phones the top bar folds its items into one menu button.

## Done

- Audit: [docs/concepts/fit-audit.md](concepts/fit-audit.md), 588 combinations measured, findings F1–F15, O1, O2 (measuring spec [e2e/acceptance/fitAudit.spec.ts](../e2e/acceptance/fitAudit.spec.ts), not in CI).
- Piece 1 — small text and overflow (F1–F4, F9–F11):
  - the brand subline, the LIVE badge, the development badge and every `<small>` hint at the small size (14 px);
  - a unit test reads every stylesheet and component for a text size below 14 px;
  - the arena's phone column never grows past the window; the seasons line wraps between seasons;
  - "Verify this match": the rounds table scrolls inside its own box;
  - the leaderboard on a narrow board (a phone, a large font) shows the figures under the name, so names are not cut;
  - on phones at a large font the page margin and the panel padding stop growing (unchanged at the default font).
- Earlier, on master: the admin-area decisions and build order (PR #54).

## Running

- Piece 2 — card numbers and cell sizes (F5, F6, F8, F12, F15).

## Open

- Piece 3 — names and the phone header (F7, F14, O1, O2); piece 4 — keep it so (playerFit at 360×640, the console on phones, 125 % / 150 %).
- The audit again after the fixes; one royale played at 390×844 and 1280×720; screenshots for the owner.
- Building the admin area, piece by piece in the order of admin-area.md §9; piece 0 first.

## Needs the owner's word

- Nothing yet. PR #55 stays open for review (not merged).
