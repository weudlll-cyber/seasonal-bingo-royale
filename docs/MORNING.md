# Morning sheet

The admin area's night (branch `feat/admin-area`, PR #56, not merged): what is done, running, open, reverted and what needs the owner's word. Regenerated after every piece. Source: [docs/concepts/admin-area.md](concepts/admin-area.md) §9 and [admin-values.md](concepts/admin-values.md).

## Done

- Setup `5ce2041`: `reports/screens/` and `reports/logs/` git-ignored as a whole, their old contents deleted; CLAUDE.md says screenshots are never committed and deleted once checked.
- Piece -1, self-check of the owner's local test (no code change):
  - (a) PASS — the "new" marker in My matches: an asynchronous match, the player has seen it; a day later (development time travel, 68 numbers drawn) the lobby shows "• new"; after "Open" and back it is gone. Note: during the match's quiet hours (default 00:00–07:00) nothing is drawn, so nothing is new — a test at night sees no marker for that reason. Shot `admin-m1-marker-desktop-light.jpg`.
  - (b) PASS — the website chat room `bingo` (website stack of e2e/chatEmbed.spec.ts): desktop side panel and phone drawer show `/embed/chat?room=bingo` in the game's theme; on a phone Chat is in the menu. Shots `admin-m1-chat-desktop-light.jpg`, `admin-m1-chat-phone-light.jpg`.

- Piece 0b — the flaky live-match test (`e2e/realGame.spec.ts`): fixed at its cause. CI run 44647390930 (webkit-mobile) failed at "a drawn number on the card to tap": its trace, rebuilt, shows 20 distinct draws with a single card number (18, already marked) — the host drew a fixed 15 numbers after the reconnect, so the step depended on what the draws brought. Now the host draws until a card number is open, bounded by the 51 numbers a card does not hold (the 52nd draw must hit it), the test's timeout sized for that worst case. No engine fault: no number was drawn twice. Chromium run passes; CI below.

## Running

- Piece 0 — limits from the server.

## Open

- Pieces 1, 2, 3, 4, 5, 6, 7, 8 of admin-area.md §9.

## Reverted

- Nothing.

## Needs the owner's word

- Nothing yet.
