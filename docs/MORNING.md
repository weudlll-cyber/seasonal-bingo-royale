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
  - Commit `5f0e965`; CI and CodeQL green (run 44855660840).
- Piece 1 — the Admin menu and the Overview:
  - Migration `0020_admin_overview.sql`: permissions `admin.view` and `maintenance.manage` for game_admin and super_admin (website admins are game_admin, D41); aborting any match is their seeded `match.abort`. The audit log `sbr.audit_log` (04 §3): when, the admin's account id (no foreign key) and roles at the time, action, target, the change as JSON, the request id; each entry chains the hash of the one before (`apps/server/src/admin/audit.ts`, SHA-256, written under an advisory lock); triggers refuse UPDATE, DELETE and TRUNCATE and the app role may only INSERT and SELECT (`db/roles.ts`).
  - New endpoints (`apps/server/src/http/routes/admin.ts`), each checked on the server, zod-validated, under the session plugin's API rate limit and CSRF check, every change audited:
    - `GET /api/v1/admin/overview` (`admin.view`): open and running matches with host and players, maintenance, the health line (version, start time).
    - `POST /api/v1/admin/matches/:code/abort { reason }` (`match.abort`): stops any match as the system; players read "cancelled by the system" with the reason.
    - `POST /api/v1/admin/maintenance { on, reason }` (`maintenance.manage`): writes or removes the same flag file `sbr maintenance` uses; the check reads it again at once.
    - Authz rows (apps/server/test/authzMatrix.integration.test.ts): allowed for Admin (game_admin) and owner (super_admin); refused for signed out, guest, player, another host and the match's host. Website mode: allowed for the website admin; refused for signed out, guest, member and a member who may host (no super_admin there, D41).
  - Client: "Admin" in the navigation for `admin.view` (in the phone menu too), `#/admin` with the Overview (`apps/web/src/admin/AdminOverview.tsx`, `admin.css`): health line, Maintenance with a reason and one button, the open matches with Abort (reused `host/AbortMatch`, now with an optional route and a done callback).
  - The version: the image build takes `SBR_VERSION` (Dockerfile ARG; `ops/lib/config.sh` passes the ref and commit); without it "development".
  - Development sign-in "Sign in as admin" (`dev-admin`, game_admin); its sessions count the second step as done, since nobody knows a development account's password.
  - Tests that failed first: `dbRoles.integration` (audit_log did not exist), `adminOverview.integration` (no module), `authzMatrix.integration` with the routes unregistered (4 failed), `apps/web/src/admin/adminOverview.test.tsx` (no page). e2e: `adminOverview.spec` (Overview, abort, fit at 1280×720 and 390×844 at 100/125/150 % with `acceptance/fitProbe`), `adminMaintenance.spec` (serial, with the maintenance spec).
  - Reused: `requirePermission`, `matchIdByCode`, `sendEngineError`, the maintenance flag, `AbortMatch`, `gameTypeName`/`problemText`, the panel/chip/field tokens; e2e `signIn`, `hostMatch`, `stopMatch`, `post`, `captureLook`, `openMenu`, `fitProbe`.
  - Review shots: `admin-1-overview-*`, `admin-1-maintenance-*` (desktop and phone, light and dark).
  - Commit `a69b101`: CI red in one spec on all three browsers (`adminMaintenance.spec`: a fresh checkout has no data directory before its first maintenance flag, so the switch answered 500; `sbr maintenance` and local development always had one). Fixed in `416da6b`: the switch creates the directory; the integration test starts without one (it failed first with the 500). CodeQL green.
- Piece 2 — the settings store and the History:
  - Migration `0021_settings_store.sql`: permission `settings.edit` for game_admin and super_admin; `sbr.settings_versions` append-only (triggers refuse UPDATE, DELETE, TRUNCATE; the app role may only INSERT and SELECT, `db/roles.ts`).
  - `apps/server/src/admin/settings.ts` (`SettingsStore`): each change writes a new version with who, when and the comment, moves `current_version` and writes its audit entry in the same transaction (`appendAudit`, split out of `recordAudit`); the server keeps the current documents in memory (loaded at start, replaced on change), so a change applies at once.
  - First document `features`: the Overview's switches guests and e-mail confirmation (`config/features.ts` `liveSwitches`; the environment is only their first default, §8 (p)). Read on every use: the session answer, guest sign-in, the login's e-mail check, and the league's e-mail rule when a match's points are awarded (the match store now asks a function).
  - New endpoints (`apps/server/src/http/routes/adminSettings.ts`; checked on the server, zod-validated, rate-limited and CSRF-checked by the session plugin, every change audited): `POST /api/v1/admin/switches` (`settings.edit`), `GET /api/v1/admin/history?before=` (`admin.view`, 50 at a time, with each document's defaults), `POST /api/v1/admin/history/:id/undo` (`settings.edit`; 404 for no such change, 409 when nothing is left to undo). The Overview's answer carries the switches. Authz rows: allowed for Admin and owner, refused for signed out, guest, player, another host, the match's host; website mode allowed for the website admin only.
  - Undo: a new version in which the values the undone change touched are back as before; later changes to other values stay (see "needs the owner's word").
  - Client: the admin area's navigation (Overview, History; `admin/AdminNav.tsx`), the switches on the Overview with what each does and a comment (`AdminSwitches.tsx`), the History page `#/admin/history` (`AdminHistory.tsx`, `changeText.ts`): when, who, old → new, comment, "Undo this change", "Show older".
  - `apps/server/src/http/app.ts` stayed under 300 lines by moving the game routes into `http/gameRoutes.ts`.
  - Tests that failed first: `dbRoles.integration` (settings_versions writable by the app), `adminSettings.integration` with its routes unregistered (3 failed), `apps/web/src/admin/adminHistory.test.tsx` (no page). Also in the authz matrix. e2e `adminHistory.spec` (serial: switches guests off, the server refuses a guest, the History shows it, undo brings it back; fit at 1280×720 and 390×844 at 100/125/150 %).
  - Reused: `requirePermission`, the audit chain, `SessionProvider`, `problemText`, the panel/chip/field tokens; e2e `signIn`, `post`, `captureLook`, `fitProbe`.
  - Review shots: `admin-2-switches-*`, `admin-2-history-*`.

## Running

- Piece 2's checks and CI.

## Open

- Pieces 3, 4, 5, 6, 7, 8 of admin-area.md §9.

## Reverted

- Nothing.

## Needs the owner's word

- An Admin's abort reads "This match was cancelled by the system" with the reason. "by an admin" would need a new value in the abort event and new wording for players; left as is.
- Undo reverts only the values the undone change touched (a new version); the concept's wording ("a new version whose content is an older version's") would also undo every later change to other values of the same document. When nothing changed after it, both are the same.
- The e-mail switch is shown in both modes; in website mode the website decides who is confirmed, so it changes nothing there but is harmless. Hide it in website mode?
- The audit log stores no IP address: docs/spec/04 lists `ip inet` for `audit_log`, but the game stores no IP address (migration 0018, docs/PRIVACY-DATA.md). Which should win?
