# Morning sheet

The admin area's night (branch `feat/admin-area`, PR #56, not merged): what is done, running, open, reverted and what needs the owner's word. Regenerated after every piece. Source: [docs/concepts/admin-area.md](concepts/admin-area.md) §9 and [admin-values.md](concepts/admin-values.md).

## Done

- Setup `5ce2041`: `reports/screens/` and `reports/logs/` git-ignored as a whole, their old contents deleted; CLAUDE.md says screenshots are never committed and deleted once checked.
- Piece -1, self-check of the owner's local test (no code change):
  - (a) PASS — the "new" marker in My matches: an asynchronous match, the player has seen it; a day later (development time travel, 68 numbers drawn) the lobby shows "• new"; after "Open" and back it is gone. Note: during the match's quiet hours (default 00:00–07:00) nothing is drawn, so nothing is new — a test at night sees no marker for that reason. Shot `admin-m1-marker-desktop-light.jpg`.
  - (b) PASS — the website chat room `bingo` (website stack of e2e/chatEmbed.spec.ts): desktop side panel and phone drawer show `/embed/chat?room=bingo` in the game's theme; on a phone Chat is in the menu. Shots `admin-m1-chat-desktop-light.jpg`, `admin-m1-chat-phone-light.jpg`.

- Piece 0b — the flaky live-match test (`e2e/realGame.spec.ts`): fixed at its cause. CI run 44647390930 (webkit-mobile) failed at "a drawn number on the card to tap": its trace, rebuilt, shows 20 distinct draws with a single card number (18, already marked) — the host drew a fixed 15 numbers after the reconnect, so the step depended on what the draws brought. Now the host draws until a card number is open, bounded by the 51 numbers a card does not hold (the 52nd draw must hit it), the test's timeout sized for that worst case. No engine fault: no number was drawn twice. Commit `6b1155a`; CI and CodeQL green (run 44841933196, webkit-mobile included).
- Piece 0 — limits from the server (§8 (m), (n)):
  - `LIMITS` in @sbr/contracts (`config/limits.ts`, with its zod schema): title length, players, display name and password lengths, missed-number delay, round pause (now up to 120 s), the start countdown, the realtime draw interval. The server validates match input, accounts and profiles with it and sends it in `GET /session` as `limits`; one display-name pattern for registration and profiles (`apps/server/src/auth/displayName.ts`).
  - The client reads them with `useLimits()` (`shell/session.tsx`) and keeps no copy: host form (title, players, round pause 3–120 s — the browser refuses 121 before sending —, missed-number delay, the countdown text, the interval placeholder), Quick Test (bots, countdown texts), bot fill, register and reset forms. The form's clamps are gone; the fields' min/max and the server keep the ranges. `CreateMatch.tsx` stayed under 300 lines by moving its first fields into `host/BasicsFields.tsx`.
  - The reason an asynchronous lobby closes with names the frozen ruleset's `lobby.openMsAsync` ("within 24 hours" today; `lobbyTooFewReason`).
  - Tests that failed first: `apps/server/test/auth.integration.test.ts` "sends the limits…" (expected undefined to equal LIMITS), `packages/application/src/match/startRules.test.ts` (lobbyTooFewReason not a function), `apps/web/src/host/serverLimits.test.tsx` (title maxLength 60 instead of the sent 40; register hint "3 to 24" instead of the sent "4 to 20"). Reused: `show`/`serveMatch` (test/matchFixture, which now serves the limits; new `serveWithLimits`, `showWithLimits`, `renderInSession` for forms on their own).
  - e2e (Chromium): hostNav flaked twice under load in the full local run and was fixed at its cause: the new console tab gets the suite's 20 s first-load time, and the phone-menu check measures the bar and its menu, not the lobby below (which lists whatever other tests created).

## Running

- Piece 1 — the Admin menu and the Overview.

## Open

- Pieces 2, 3, 4, 5, 6, 7, 8 of admin-area.md §9.

## Reverted

- Nothing.

## Needs the owner's word

- Nothing yet.
