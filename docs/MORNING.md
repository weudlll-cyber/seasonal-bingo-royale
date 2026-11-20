# Morning sheet

What the fit fixes (branch `docs/fit-audit`, PR #55) did, what runs, what is open and what needs the owner's word. Regenerated after every finished piece. Source: [docs/concepts/fit-audit.md](concepts/fit-audit.md) §3 and §5; the result in its §6. Owner decisions of 2026-11-20: no text below 14 px at the default font; card numbers never below 16 px; on phones the top bar folds its items into one menu button.

## Done

- Piece 1 — small text and overflow (F1–F4, F9–F11):
  - the brand subline, the LIVE badge, the development badge and every `<small>` hint at the small size (14 px); a unit test reads every stylesheet and component;
  - the arena's phone column never grows past the window; the seasons line wraps between seasons;
  - "Verify this match": the rounds table scrolls inside its own box;
  - a narrow leaderboard shows the figures under the name;
  - on phones at a large font the page margin and the panel padding stop growing (unchanged at the default font).
- Piece 2 — cards (F5, F6, F8, F12, F15):
  - card numbers never below 16 px on the own card and the watched cards;
  - cells grow with the font; where the cards no longer fit, their box scrolls instead of the numbers shrinking;
  - the own card never wider than a phone; no page scroll on a desktop round at 150 %.
- Piece 3 — names and the phone header (F7, F13, F14, O1, O2):
  - names are never cut (rows move seasons and points to a second line; a narrow podium shows rows);
  - below 960 px the top bar is one row (brand, theme toggle, Menu); the menu holds the links and the account, keyboard usable; desktop unchanged; "← Seasonal Entertainment" stays top left;
  - the arena's title line wraps LIVE and the host button; ball, numbers and the whole card fit a 360×640 phone at the default font.
- Piece 4 — keep it so: a test in e2e/playerFit.spec.ts (Chromium, about 40 s in CI) at 360×640, 390×844 and 1280×720, 100 / 125 / 150 %, the console on phones included.
- After the fixes (fit-audit.md §6): 588 combinations measured again; with a finding 30 instead of 504, none at the default font (164 before). Small text, card numbers, cut text, overflow and desktop page scroll: 0.
- Played: one full-length realtime royale (19.7 min) and one with the fast rules, on a 390×844 phone and at 1280×720; no finding. Screenshots `reports/screens/latest/fitfix-*` (lobby, player, spectator, interlude, results, leaderboard, the phone menu closed and open; before: `fit-*`).
- BACKLOG: the fit item moved to Part two.

## Running

- Nothing. The dev server runs on this branch (standalone, 3900/5390).

## Open

- Building the admin area, piece by piece in the order of admin-area.md §9; piece 0 first.

## Needs the owner's word

- fit-audit.md §6.3: on phones at 125 % / 150 % the own card, the watched cards and the console's Draw next end below the window (the 16 px numbers do not leave room). Keep it (the page scrolls to them), or shrink or hide something on a phone at a large font?
- PR #55 stays open for review (not merged).
