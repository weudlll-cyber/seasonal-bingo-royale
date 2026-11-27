# Morning sheet

## Kit 0.34 (branch `feat/kit-0.22`, draft PR #76, NOT merged, NOT tagged: the owner looks first)

### Done

- **Piece 1, the pin and every "Migration, per game" line from v0.23.0 to v0.34.0** (`7c1e97f`; one commit per step). Test tools and guards (K66); the sweep in the admin and start-match specs (K67: found and fixed the 29 px admin section links, the 24 px checkbox rows and the 20 px yes/no boxes); step badges (K68); countdowns on the server's clock, the session answer names `serverTime` (K69); the kit's API client and `useApiGet` (K70); `sbr update` installs the kit's whole `ops/` folder, as an update of its own (`ff6d090`); backups and the website route file from that folder (K71, K72); load helpers (K73); the website stand-in (K74); `secure` headers over https; season icons (K83); the operator address (K85); `sbr` on the kit's admin command (K87); the host baseline (K88); container hardening (K89); database roles (K90, with v0.34.0's TEMPORARY); `FailureBrake` with `reserve` (K92); base components and header looks (K95, K96).
- **A fault found and fixed, older than this chain:** since the v0.22.0 server parts every write of `sbr loadcheck` and of the development load scripts was refused (they named an origin other than the host they called). Test `loadOrigin.test.ts`.
- **What changes for you to notice:** a restore through `sbr` asks `[y/N]`, refuses a differing seed **or recovery** key without `--force-env`, and **leaves the game stopped if it fails** (the kit's behaviour; before, the game was started again). Backups made before 25 November 2026 are first written again with `sbr rewrite_backup`. Season icons are named "Spring" and so on. A disabled button is muted, a disabled field looks locked. On a phone the own card is a little smaller where the window's height decides it.
- **Where the kit's way cost something:** its stand-in's members are all e-mail-verified (the league test marks one test account unverified in its own database), its login has no page of its own, and its chat frame shows no room or theme; it keeps idle connections for 5 s, so the spec polls faster.

- **Piece 2, the look.** (a) The kit's three header looks (K96); the organizer's header at 1280×720 in website mode with three badges is one row (`chatEmbed.spec.ts`). (b) The final placement uses the kit's dense result frame (K93). **Places whole above the chat strip** (website mode, 16 px, 20 players; player / spectator / host console): 1280×720 **8 / 8 / 8** (floor 7 met; v0.22.0: 5, before the kit: 7), 1366×768 7 / 7 / 8, 1536×768 8 / 8 / 8, 1440×900 12 each, 1900×860 11 each, 1920×1080 20 each. No row wraps, no finding. (c) The in-match Standings and the result rows show names without badges (2026-11-26); every Standings row is one line. (d) The Firefox sign-in failure is fixed at its cause: the account row shows once the development menu has loaded (`headerDevReady.test.tsx`); the kit's `header-dev.css` only lays the menu out.

- **Piece 3, the update path.** Built with piece 1: `sbr update` installs the kit's `ops/` folder whole (`/opt/sbr/kit/`), added by a commit of its own (`ff6d090`), so an older install updates to that commit, confirms, then updates further; the new `sbr` stops and names the installer where the folder is missing. docs/GO-LIVE.md says what a first install puts in place; operator guide §6 the two steps. **Merge without squashing**, or `ff6d090` is gone from master.

- **Piece 4, the rehearsal** (a throw-away Ubuntu 24.04 container behind a stand-in website with nginx, a copy of the dev data under the development keys; nothing on a server). Install of master `d7d841e`, the data taken over, update to `ff6d090` and confirm, update to the branch, backup, drill, restore through `sbr`, rollback, update again, uninstall, then a fresh standalone install of the branch. **At every step with data: 24 accounts, 1943 matches, 174013 match events; the seed key opens the newest sealed match seed** (a fresh install: 0 / 0 / 0, nothing sealed yet). Drill: 29 tables, every row count equal, 1 volume copy, 2 secret files; Bingo's: 26 migrations, the same counts. Roles: `sbr_owner` has no `TEMPORARY` after the update driven by the older `sbr` and has it after the first restore (from then on also after later updates); the app role never creates. Postgres hardening applies with the update (read-only root, all capabilities dropped but four) and the rollback takes it back. Uninstall removed the route file and kept the backups. Standalone: the host baseline allowed SSH's real port (2222), 80 and 443, turned `ufw` and a fail2ban jail on.
- **Four faults the rehearsal found, all fixed:** (1) **since 2026-11-03 no standalone install started**: its env file holds the two website settings empty and the server refused them (`env.ts`, test failed first). (2) **No older install could update to the branch** ("older than the database roles"): its `sbr` looks for `ops/lib/db-roles.sql`, which the move to the kit's roles deleted; the file stays without a statement (`olderUpdate.test.ts`, failed first). (3) **The rollback of the first update with the kit's folder stopped** (`cp: cannot stat 'kit'`). (4) **A rollback ended with a syntax error** although it had worked: it overwrites the running `sbr`. Kit findings: (3) `sk_admin_stack` should skip a file that was not kept; (4) a game's command must end on one line (`sk_admin_main "$@"; exit`).
- **What still needs a real server:** a certificate from Let's Encrypt, the real website's installer and Caddy mode beside the update, the nightly timer over a night, pulling backups to the PC, mail, the host baseline on a server reached over SSH, a reboot, and the load check at the server's size.

- **Piece 5, the sweep** (K67, `SBR_SWEEP_KIT=1`): every match screen and the header, website mode with the chat strip and standalone, the six desktop sizes, 360x780, 390x844, 430x932, root font 16 and 32 px, light and dark; the kit's probe, axe, and Bingo's text floor and overlap check. No pictures (your word of 2026-11-27: you look in the browser).
- **What the sweep found, fixed:** tappable names in the Standings and the results, "Whole match log", "What the seasons do" and the website tick were under 44 px; on the finished screen the own card's cells were 38 to 41 px; at 32 px on phones the lobby entries, the host console's controls and draw-mode buttons, the recap and the drawn numbers ran past the window; the watched cards and the prizes scrolled without being a Tab stop. Names in the in-match Standings are now 44 px rows, so fewer rows are in view there.

### Exemptions (what the sweep still reports)

| Finding                             | Where                                                       | Reason                                                                                                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Own card cells 42x42 px (44 asked)  | 1280x720, website mode, player (royale and classic)         | Owner decision K18: the board is whole without scrolling at every desktop size (kit `docs/ADOPTION.md:300-307`). At 44 px it would scroll under the chat strip.                        |
| A linked name one line high (24 px) | the results in website mode, desktop                        | Owner decision of 2026-11-24: at least 7 places whole above the strip at 1280x720.                                                                                                     |
| Text "covered by the chat bar"      | 390x844 and 430x932, the last line in view of a long screen | Kit `css/dock.css:11-13`, `100-107`: on a phone the content scrolls alone above the bar; the line is cut at the scroll edge and reached by scrolling. Bingo's overlap check counts it. |

### Checks: how many full runs, and why

- Sweep: one full run (51 min). Three narrowed re-checks of the screens a fix could change: 35 min (light theme, the recap screens in both), 19 min (phones and the two contrast sizes) and a short one (the recap on phones). All clean but the exemptions above. The first run's contrast findings were lines judged while fading in; the sweep now looks with fades off.
- Rehearsal: one, started twice (the old master's standalone install cannot start) and continued three times in the same server, once after each further fault.
- Browser specs covering the changes, once, locally (Chromium, 20 tests of 9 specs): 19 passed; `playerFit.spec.ts` found that with 44 px names the player's side column no longer showed the top 3 Standings rows at 1280x720. Fixed (rows exactly 44 px, the panel's least height raised); `playerFit` and `chatEmbed` run again, both passed.
- Pull request CI: CI
- No local `pnpm verify` (your word of 2026-11-26).

### Decisions taken on the way

- Tappable names are 44 px everywhere but in the docked results (exemption above).
- On the finished screen the own card keeps 44 px cells; that screen may scroll.
- The rehearsal ran in website mode (the production target); standalone was rehearsed as a fresh install.
- `ops/lib/db-roles.sql` stays as an empty stand-in until no install from before the kit's admin command is left.

### Kit findings

1. `ops/lib/admin-update.sh:77-80`: the rollback copies every named stack file, also one that was never kept, and stops half done.
2. The same copy overwrites the running command; a game must end it with `sk_admin_main "$@"; exit`.
3. `ops/lib/backup-restore.sh:151-155`: a failed restore leaves the app stopped.
4. Migration text, K90: a game removing its own `db-roles.sql` can break an older updater; the owner's `TEMPORARY` comes only with the first run of the new command.
5. ADOPTION: the first of the two update steps does not yet install the kit's folder.
6. `src/server/index.ts:15` exports `FailureBrake` but not its `Attempt` type.
7. The sweep judges contrast during a fade; `axeFinder` cannot leave the chat frame out.
8. Dense linked rows cannot hold 44 px targets and 7 places; a kit rule is missing.
9. Website stand-in: every member verified, no login page, the chat frame shows no room or theme, 5 s keep-alive.
10. Backups: asking for the backup settings writes the secret files.

### Noticed, left alone

- `load/asyncJump.mjs` fails to create its match (`PRESET_REQUIRED`), older than this chain.
- The host console can scroll a few pixels after the root font changes on an open page.
- `reports/screens/k34p2/` (check pictures, git-ignored) is still on the PC: deleting it was not permitted.

### Open

- Nothing of the chain beyond the lines above.

### Needs the owner's word

- Look at draft PR #76 in the browser; merge (**without squashing**) or not. Proposal: merge when you have looked.

### Lines against master `d7d841e`

255 text files (this sheet and binary files left out): 35395 lines before, 37310 after.

**Removed**, each replaced by a kit part: `db/roles.ts` (kit `grantAppRole`), `league/useApiGet.ts` and `shell/http.test.ts` (`useApiGet`, `createApiClient`), `seasonIcons.ts` and the four optimized season files (`seasons.css`), `useSecondsUntil.ts` (`useCountdown`), `ops/lib/uninstall.sh` (the admin command), `ops/lib/websiteRoute.sh` (`website-route.sh`).

**Moved out** into the kit: the screen and load test helpers, the website stand-in proxy, the backup, admin, route, roles, host and operator scripts (`ops/kit/` is the pinned kit's folder, byte for byte, test `kitOpsCopy.test.ts`), the base button, panel, field and chip rules.

<details><summary>Per file</summary>

| File                                                | Before | After   |
| --------------------------------------------------- | ------ | ------- |
| `apps/server/demo-league.mjs`                       | 49     | 48      |
| `apps/server/package.json`                          | 49     | 49      |
| `apps/server/src/auth/rateLimit.ts`                 | 60     | 107     |
| `apps/server/src/auth/sessionPlugin.test.ts`        | new    | 69      |
| `apps/server/src/auth/sessionPlugin.ts`             | 154    | 151     |
| `apps/server/src/cli.ts`                            | 250    | 256     |
| `apps/server/src/config/env.test.ts`                | 92     | 105     |
| `apps/server/src/config/env.ts`                     | 212    | 215     |
| `apps/server/src/db/appRole.ts`                     | new    | 23      |
| `apps/server/src/db/roles.ts`                       | 40     | removed |
| `apps/server/src/http/app.ts`                       | 282    | 297     |
| `apps/server/src/http/plugins/securityHeaders.ts`   | 59     | 53      |
| `apps/server/src/http/routes/auth.ts`               | 276    | 276     |
| `apps/server/src/http/routes/devSignIn.ts`          | 79     | 82      |
| `apps/server/src/http/routes/health.ts`             | 42     | 33      |
| `apps/server/src/http/routes/loginBrake.test.ts`    | new    | 113     |
| `apps/server/src/http/routes/websiteSignIn.ts`      | 124    | 123     |
| `apps/server/src/http/sessionStart.ts`              | new    | 70      |
| `apps/server/src/http/signIn.ts`                    | 90     | 89      |
| `apps/server/src/kitOpsCopy.test.ts`                | new    | 38      |
| `apps/server/src/loadOrigin.test.ts`                | new    | 50      |
| `apps/server/src/olderUpdate.test.ts`               | new    | 25      |
| `apps/server/test/containers.integration.test.ts`   | new    | 50      |
| `apps/server/test/dbRoles.integration.test.ts`      | 187    | 195     |
| `apps/server/test/harness.ts`                       | 105    | 123     |
| `apps/server/test/installNextSteps.test.ts`         | 48     | 48      |
| `apps/server/test/websiteLogin.integration.test.ts` | 242    | 247     |
| `apps/server/test/websiteRoute.integration.test.ts` | 242    | 247     |
| `apps/web/package.json`                             | 30     | 30      |
| `apps/web/src/App.tsx`                              | 68     | 68      |
| `apps/web/src/account/AccountPage.tsx`              | 224    | 224     |
| `apps/web/src/account/PasswordReset.tsx`            | 147    | 147     |
| `apps/web/src/account/Register.tsx`                 | 81     | 81      |
| `apps/web/src/account/SignIn.tsx`                   | 64     | 64      |
| `apps/web/src/account/TwoFactor.tsx`                | 167    | 167     |
| `apps/web/src/account/WebsiteSignIn.tsx`            | 86     | 86      |
| `apps/web/src/account/account.css`                  | 64     | 64      |
| `apps/web/src/account/formParts.tsx`                | 90     | 90      |
| `apps/web/src/admin/AccountCard.tsx`                | 122    | 122     |
| `apps/web/src/admin/AdminAccounts.tsx`              | 149    | 149     |
| `apps/web/src/admin/AdminHistory.tsx`               | 118    | 118     |
| `apps/web/src/admin/AdminNav.tsx`                   | 47     | 47      |
| `apps/web/src/admin/AdminOverview.tsx`              | 181    | 182     |
| `apps/web/src/admin/AdminPresets.tsx`               | 186    | 186     |
| `apps/web/src/admin/AdminSwitches.tsx`              | 115    | 115     |
| `apps/web/src/admin/LeagueCorrections.tsx`          | 125    | 125     |
| `apps/web/src/admin/PresetEditor.tsx`               | 121    | 121     |
| `apps/web/src/admin/SettingsValues.tsx`             | 70     | 70      |
| `apps/web/src/admin/StepUp.tsx`                     | 66     | 66      |
| `apps/web/src/admin/ValueField.tsx`                 | 139    | 142     |
| `apps/web/src/admin/admin.css`                      | 140    | 155     |
| `apps/web/src/admin/adminOverview.test.tsx`         | 134    | 153     |
| `apps/web/src/components/BingoHeader.tsx`           | 31     | 31      |
| `apps/web/src/components/CellFace.tsx`              | 69     | 69      |
| `apps/web/src/components/CutScreen.tsx`             | 83     | 83      |
| `apps/web/src/components/DevBadge.tsx`              | 41     | 41      |
| `apps/web/src/components/DrawControls.tsx`          | 86     | 86      |
| `apps/web/src/components/DrawTicker.tsx`            | 102    | 102     |
| `apps/web/src/components/FinalNotice.tsx`           | 72     | 72      |
| `apps/web/src/components/FinalPlacement.tsx`        | 174    | 175     |
| `apps/web/src/components/GameTypeField.tsx`         | 45     | 45      |
| `apps/web/src/components/OwnerArea.tsx`             | 140    | 140     |
| `apps/web/src/components/PatternsPanel.tsx`         | 66     | 66      |
| `apps/web/src/components/Playback.tsx`              | 129    | 130     |
| `apps/web/src/components/RankRow.tsx`               | 95     | 92      |
| `apps/web/src/components/SeasonIcon.tsx`            | 77     | 87      |
| `apps/web/src/components/Standings.tsx`             | 160    | 160     |
| `apps/web/src/components/StartDrawField.tsx`        | 69     | 69      |
| `apps/web/src/components/StartForm.tsx`             | 221    | 221     |
| `apps/web/src/components/StartMarkingField.tsx`     | 113    | 113     |
| `apps/web/src/components/StepBadges.test.tsx`       | 57     | 53      |
| `apps/web/src/components/StepBadges.tsx`            | 67     | 36      |
| `apps/web/src/components/cardView.test.tsx`         | 73     | 73      |
| `apps/web/src/components/matchSide.css`             | 221    | 223     |
| `apps/web/src/components/noNameBadges.test.tsx`     | new    | 138     |
| `apps/web/src/components/playerView.test.tsx`       | 249    | 257     |
| `apps/web/src/components/podium.css`                | 140    | 140     |
| `apps/web/src/components/results.css`               | 221    | 202     |
| `apps/web/src/components/results.test.tsx`          | 103    | 105     |
| `apps/web/src/components/seasonMark.css`            | 25     | 25      |
| `apps/web/src/components/seasonMarks.test.tsx`      | 70     | 70      |
| `apps/web/src/components/segmented.css`             | 35     | 38      |
| `apps/web/src/designTokens.test.ts`                 | 192    | 105     |
| `apps/web/src/game/ArenaCards.tsx`                  | 72     | 72      |
| `apps/web/src/game/ArenaNotice.tsx`                 | 80     | 80      |
| `apps/web/src/game/AwaySummary.tsx`                 | 119    | 119     |
| `apps/web/src/game/EndActions.tsx`                  | 39     | 39      |
| `apps/web/src/game/HostLink.tsx`                    | 32     | 32      |
| `apps/web/src/game/Interlude.tsx`                   | 165    | 164     |
| `apps/web/src/game/Lobby.tsx`                       | 211    | 211     |
| `apps/web/src/game/MatchCancelled.tsx`              | 50     | 50      |
| `apps/web/src/game/MatchScreen.tsx`                 | 216    | 211     |
| `apps/web/src/game/MyMatches.tsx`                   | 84     | 84      |
| `apps/web/src/game/Registration.tsx`                | 105    | 105     |
| `apps/web/src/game/VerifyMatch.tsx`                 | 161    | 161     |
| `apps/web/src/game/WaitingRoom.tsx`                 | 127    | 122     |
| `apps/web/src/game/WatchCards.tsx`                  | 116    | 117     |
| `apps/web/src/game/arena.css`                       | 275    | 277     |
| `apps/web/src/game/asyncMatch.test.tsx`             | 190    | 190     |
| `apps/web/src/game/ball.css`                        | 91     | 91      |
| `apps/web/src/game/game.css`                        | 188    | 192     |
| `apps/web/src/game/interlude.css`                   | 74     | 75      |
| `apps/web/src/game/interlude.test.tsx`              | 247    | 248     |
| `apps/web/src/game/liveCard.css`                    | 79     | 77      |
| `apps/web/src/game/registration.test.tsx`           | 157    | 160     |
| `apps/web/src/game/seasonsOverview.css`             | 80     | 82      |
| `apps/web/src/game/serverClock.test.tsx`            | new    | 46      |
| `apps/web/src/game/watch.css`                       | 118    | 118     |
| `apps/web/src/host/AbortMatch.tsx`                  | 55     | 55      |
| `apps/web/src/host/HostConsole.tsx`                 | 248    | 248     |
| `apps/web/src/host/HostDrawControls.tsx`            | 237    | 237     |
| `apps/web/src/host/HostLobby.tsx`                   | 205    | 205     |
| `apps/web/src/host/JumpAhead.tsx`                   | 74     | 74      |
| `apps/web/src/host/StartMatch.tsx`                  | 152    | 152     |
| `apps/web/src/host/StartSteps.tsx`                  | 110    | 110     |
| `apps/web/src/host/ThisMatchFields.tsx`             | 185    | 185     |
| `apps/web/src/host/TimingFields.tsx`                | 229    | 229     |
| `apps/web/src/host/YourMatches.tsx`                 | 49     | 49      |
| `apps/web/src/host/host.css`                        | 280    | 287     |
| `apps/web/src/host/rules.test.tsx`                  | 171    | 172     |
| `apps/web/src/league/LeaderboardPage.tsx`           | 195    | 195     |
| `apps/web/src/league/ProfilePage.tsx`               | 161    | 161     |
| `apps/web/src/league/league.css`                    | 196    | 196     |
| `apps/web/src/league/useApiGet.ts`                  | 46     | removed |
| `apps/web/src/main.tsx`                             | 43     | 47      |
| `apps/web/src/minTextSize.test.ts`                  | 121    | 118     |
| `apps/web/src/noFixedColours.test.ts`               | 43     | 24      |
| `apps/web/src/quicktest/Simulation.tsx`             | 152    | 152     |
| `apps/web/src/quicktest/TestMatch.tsx`              | 260    | 260     |
| `apps/web/src/quicktest/TestMatchReady.tsx`         | 117    | 117     |
| `apps/web/src/quicktest/quicktest.css`              | 97     | 97      |
| `apps/web/src/scrollHint.css`                       | 37     | 37      |
| `apps/web/src/seasonIcons.ts`                       | 24     | removed |
| `apps/web/src/shell/DevTools.tsx`                   | 67     | 67      |
| `apps/web/src/shell/Header.tsx`                     | 124    | 135     |
| `apps/web/src/shell/Maintenance.tsx`                | 39     | 39      |
| `apps/web/src/shell/dock.css`                       | 51     | 51      |
| `apps/web/src/shell/dockResults.css`                | 127    | 113     |
| `apps/web/src/shell/dockSide.css`                   | 233    | 236     |
| `apps/web/src/shell/dockWatch.css`                  | 62     | 62      |
| `apps/web/src/shell/header.css`                     | 167    | 24      |
| `apps/web/src/shell/headerDevReady.test.tsx`        | new    | 78      |
| `apps/web/src/shell/headerSteps.test.tsx`           | new    | 75      |
| `apps/web/src/shell/http.test.ts`                   | 21     | removed |
| `apps/web/src/shell/http.ts`                        | 81     | 53      |
| `apps/web/src/shell/session.tsx`                    | 169    | 198     |
| `apps/web/src/shell/shell.css`                      | 70     | 84      |
| `apps/web/src/test/matchFixture.tsx`                | 167    | 170     |
| `apps/web/src/types.ts`                             | 64     | 64      |
| `apps/web/src/useSecondsUntil.ts`                   | 29     | removed |
| `assets/README.md`                                  | 29     | 28      |
| `assets/seasons/autumn.svg`                         | 1      | removed |
| `assets/seasons/spring.svg`                         | 1      | removed |
| `assets/seasons/summer.svg`                         | 1      | removed |
| `assets/seasons/winter.svg`                         | 1      | removed |
| `docs/BACKLOG.md`                                   | 175    | 175     |
| `docs/GO-LIVE.md`                                   | 179    | 183     |
| `docs/OPEN.md`                                      | 18     | 18      |
| `docs/concepts/admin-mockups/admin-history.html`    | 121    | 121     |
| `docs/concepts/admin-mockups/admin-overview.html`   | 145    | 145     |
| `docs/concepts/admin-mockups/admin-section.html`    | 186    | 184     |
| `docs/concepts/admin-mockups/mockup.css`            | 366    | 367     |
| `docs/concepts/admin-mockups/organizer-start.html`  | 180    | 180     |
| `docs/concepts/fit-audit.md`                        | 418    | 434     |
| `docs/concepts/kit-adoption.md`                     | 207    | 257     |
| `docs/operator-guide.md`                            | 196    | 196     |
| `docs/spec/01-game-design.md`                       | 426    | 426     |
| `docs/spec/03-security-architecture.md`             | 271    | 272     |
| `docs/spec/04-database-design.md`                   | 208    | 209     |
| `docs/spec/05-api-design.md`                        | 181    | 181     |
| `docs/spec/07-integration-architecture.md`          | 179    | 179     |
| `docs/spec/09-deployment-architecture.md`           | 133    | 133     |
| `docs/spec/10-repository-structure.md`              | 171    | 171     |
| `docs/spec/README.md`                               | 130    | 130     |
| `e2e/acceptance/asyncScreens.spec.ts`               | 119    | 120     |
| `e2e/acceptance/fitAudit.spec.ts`                   | 571    | 592     |
| `e2e/acceptance/interludeScreens.spec.ts`           | 130    | 131     |
| `e2e/acceptance/kitSweep.ts`                        | new    | 145     |
| `e2e/acceptance/leagueScreens.spec.ts`              | 79     | 81      |
| `e2e/acceptance/pauseScreens.spec.ts`               | 87     | 88      |
| `e2e/acceptance/realGame.spec.ts`                   | 304    | 305     |
| `e2e/acceptance/testPageScreens.spec.ts`            | 217    | 218     |
| `e2e/acceptance/websiteSweep.ts`                    | 260    | 274     |
| `e2e/account.spec.ts`                               | 128    | 131     |
| `e2e/adminAccounts.spec.ts`                         | 96     | 79      |
| `e2e/adminHistory.spec.ts`                          | 79     | 61      |
| `e2e/adminLeague.spec.ts`                           | 107    | 90      |
| `e2e/adminMaintenance.spec.ts`                      | 53     | 54      |
| `e2e/adminOverview.spec.ts`                         | 86     | 61      |
| `e2e/adminPresets.spec.ts`                          | 103    | 81      |
| `e2e/adminScreens.spec.ts`                          | 87     | 66      |
| `e2e/adminTechnical.spec.ts`                        | 84     | 65      |
| `e2e/asyncMatch.spec.ts`                            | 99     | 100     |
| `e2e/backToWebsite.spec.ts`                         | 228    | 223     |
| `e2e/chatEmbed.spec.ts`                             | 153    | 280     |
| `e2e/createFormPhone.spec.ts`                       | 51     | 51      |
| `e2e/fits.ts`                                       | new    | 59      |
| `e2e/fromThisSite.ts`                               | new    | 12      |
| `e2e/hostNav.spec.ts`                               | 223    | 242     |
| `e2e/leaderboard.spec.ts`                           | 158    | 162     |
| `e2e/maintenance.spec.ts`                           | 150    | 151     |
| `e2e/myMatches.spec.ts`                             | 107    | 108     |
| `e2e/passwordReset.spec.ts`                         | 93     | 97      |
| `e2e/realGame.spec.ts`                              | 163    | 164     |
| `e2e/realGame.ts`                                   | 172    | 176     |
| `e2e/screens.ts`                                    | 72     | 44      |
| `e2e/startMatch.spec.ts`                            | 90     | 69      |
| `e2e/startScreens.spec.ts`                          | 190    | 191     |
| `e2e/testMatch.spec.ts`                             | 78     | 79      |
| `e2e/topBar.spec.ts`                                | 100    | 101     |
| `e2e/verifyMatch.spec.ts`                           | 81     | 82      |
| `e2e/websiteIdle.spec.ts`                           | 75     | 69      |
| `e2e/websiteLogin.spec.ts`                          | 167    | 170     |
| `e2e/websiteStack.ts`                               | 300    | 239     |
| `load/asyncJump.mjs`                                | 99     | 95      |
| `load/common.mjs`                                   | 130    | 80      |
| `load/drawLatency.mjs`                              | 64     | 66      |
| `load/drawRun.mjs`                                  | 208    | 204     |
| `load/loadcheck.mjs`                                | 66     | 68      |
| `load/package.json`                                 | 13     | 14      |
| `load/spectatorStream.mjs`                          | 138    | 136     |
| `ops/compose.yml`                                   | 160    | 175     |
| `ops/install.sh`                                    | 205    | 238     |
| `ops/kit/backup.sh`                                 | new    | 98      |
| `ops/kit/lib/admin-uninstall.sh`                    | new    | 84      |
| `ops/kit/lib/admin-update.sh`                       | new    | 161     |
| `ops/kit/lib/admin.sh`                              | new    | 252     |
| `ops/kit/lib/backup-core.sh`                        | new    | 198     |
| `ops/kit/lib/backup-restore.sh`                     | new    | 192     |
| `ops/kit/lib/db-roles.sh`                           | new    | 42      |
| `ops/kit/lib/db-roles.sql`                          | new    | 105     |
| `ops/kit/lib/host-baseline.sh`                      | new    | 148     |
| `ops/kit/lib/operator.sh`                           | new    | 103     |
| `ops/kit/lib/website-route.sh`                      | new    | 227     |
| `ops/kit/pull-backups.ps1`                          | new    | 60      |
| `ops/kit/pull-backups.sh`                           | new    | 43      |
| `ops/lib/backup.sh`                                 | 247    | 228     |
| `ops/lib/common.sh`                                 | 165    | 142     |
| `ops/lib/config.sh`                                 | 246    | 228     |
| `ops/lib/db-roles.sql`                              | 105    | 12      |
| `ops/lib/hooks.sh`                                  | new    | 176     |
| `ops/lib/uninstall.sh`                              | 49     | removed |
| `ops/lib/website.sh`                                | 241    | 245     |
| `ops/lib/websiteApply.sh`                           | 141    | 139     |
| `ops/lib/websiteRoute.sh`                           | 137    | removed |
| `ops/sbr`                                           | 324    | 60      |
| `ops/test/real-site-drill.sh`                       | 112    | 115     |
| `ops/test/real-site.exp`                            | 30     | 30      |
| `ops/test/realSite.spec.ts`                         | 277    | 278     |
| `ops/test/website-vps.sh`                           | 230    | 230     |
| `package.json`                                      | 44     | 45      |
| `packages/ui/src/base.css`                          | 207    | 86      |
| `packages/ui/src/motion.css`                        | 92     | 92      |
| `packages/ui/src/tokens.css`                        | 32     | 31      |
| `pnpm-lock.yaml`                                    | 5694   | 5704    |

</details>

## Kit 0.22 (branch `feat/kit-0.22`, draft PR, NOT merged: the owner looks first)

### Done

- Piece 1, pin and rename: `@seasonal/kit` v0.22.0 (commit `2e8ed41`) in `apps/web` and `apps/server`; v0.14.0's rename: the 48 shared tokens other than the gutter take `--sk-` (588 places in 43 files: `apps/web`, `packages/ui` and the admin mockups), seasonal colour built in code too (`types.ts` `seasonColor`). Bingo keeps its own `--gutter` (`min(var(--sk-gutter), 4.5vw)`; the 49th shared name) and `--panel-padding`: at 320 px the page margin is 14.4 px (measured), the kit's own `--sk-gutter` 16 px. The kit's own parts (header, dock) read `--sk-gutter`, which Bingo does not set: below 356 px they now get the kit's 16 px where they got Bingo's smaller value before. `designTokens.test.ts` reads the kit's tokens without the prefix. `minTextSize.test.ts` and the web tests pass (65 files, 302); the standalone fit audit (all its sizes, 588 measurements) has no finding that the earlier baselines at the same keys did not have.
- Piece 2a, the result as the kit lays it out (K47): `frames.css` loaded (`main.tsx`), `reveal` left out; Bingo's overrides of the kit's result classes dropped (`results.css`: the panel's look, `display: contents`, the hidden reveal; `dockResults.css`: its rules on `.sk-result[...]`: padding, gap, the two-column grid, the heading's size). Bingo's own content in the frame stays (season marks, the owner's row, the podium and rows, the big line). **Places whole above the chat strip** at 1280×720, 1366×768, 1536×768, 1440×900, 1900×860, 1920×1080: 5, 4, 5, 9, 7, 17 (before: 7, 7, 7, 13, 11, 20). **The owner's floor of 7 at 1280×720 is not met** (5): the kit's frame spends a card, its padding and its heading on what Bingo's panel held in one card. Kept (no override), as the owner ruled. **Kit option that would close the gap:** a dense `ResultFrame` panel (one card for first part and "more", panel padding `--sk-space-1`, the headline on the same row as the lines, no gap between the cards). Second kit finding: the frame's headline is clamped to two lines with `overflow: hidden`; with a game's heading line height of 1.15 the descender of "Final placement" is clipped (the probe's one finding, at 1280×720): the frame should set its headline's line height.

- Piece 2b and 2c, the header: the kit's order, theme toggle last (K43): `header.css`'s `order` rules removed; `AppHeader foldBelow={960}` (K40) replaces Bingo's `max-width: 959px` fold block; the wordmark's and the dev menu's own small type removed (the kit's `max(floor, small)`, K41). `header.css` 167 to 91 lines. Spec 01 §13 says the order. Web tests 65 files, 302 pass.

- Piece 2d, the sign-in limits on the kit's `FailureBrake` (K46): `auth/loginBrake.ts` (new) wraps it; the login route asks `braked(key)` before the password check and calls `failed(key)` on a wrong one; keys and numbers as before (`loginIp` per address, `loginAccountIp` per e-mail|address, still set in the admin area). Two points the kit's class does not take, held in Bingo's wrapper: (1) a limit changed at runtime (the kit reads its rule once, so a change starts a new brake and its counts anew; **kit wish:** `FailureBrake` takes a `RateRuleSource`); (2) concurrent guesses: a failure is counted after the hash, so a burst would pass `braked` together; a key has at most as many checks under way as its limit (**kit wish:** the brake reserves a check). The kit asks for short normalised keys; Bingo's account key holds the e-mail (at most 254 characters), as before. Test `routes/loginBrake.test.ts` (3): a correct sign-in is never braked and the limit is reached by wrong passwords only (both failed on the old code), guesses sent together are held back. A bug found while building it (the check held until the answer had left, so correct sign-ins under load braked themselves) was fixed before the first commit. Spec 03 §13 says the rule. Piece 2e: `routes/openRounds.ts` takes the kit's `openRoundsPage` since v0.11.0 (PR #67): nothing to do.

- Piece 3, step badges (K56): the session answer names the signed-in member's own `steps` in website mode (`routes/auth.ts` `accountOf`, read from `sbr.accounts.steps` as the website last sent them; standalone answers as before), the client passes them as `account.steps` to `AppHeader` (`shell/Header.tsx`). Tests: `shell/headerSteps.test.tsx` (2; the badge one failed on the old code), `websiteLogin.integration.test.ts` (the session answer; runs in CI).

- Piece 4, server parts (2026-11-25): `sessionCookie` and `sessionCookieOptions` replace `cookieConfig`, `setSessionCookie` and `clearSessionCookie` (names `sbr_session`, `__Host-`/`__Secure-` as before; Max-Age the session's own absolute length: website 7 days, standalone 30; the admin session's cookie unchanged); the sign-in's session opening moved to `http/sessionStart.ts` (new; `auth.ts` was at its 300-line limit). `writeCheck` runs before Bingo's CSRF token on every `/api` write (trusted proxies `SBR_TRUSTED_PROXIES`): **a write that names neither `Origin` nor `Sec-Fetch-Site` is now refused.** Browsers send them; the load check (`load/common.mjs`), the demo league script and the rehearsal's curl calls already send `Origin`; the tests' own requests now say it too (integration harness: one wrapper; e2e: `e2e/fromThisSite.ts`). The install's nginx and Caddy routes pass the visitor's `Host`, which the check compares; **a proxy that rewrites `Host` without `X-Forwarded-Host` from a trusted address would have every write refused** (worth one sign-in after the next update). `securityHeaderSet` feeds helmet (its directives and its six headers; helmet's own further headers and directives stay, so nothing was dropped; no HSTS). `routes/health.ts` answers with `readiness` and `HEALTH_PATHS` (its `openRouteLimit` stays). Tests: `auth/sessionPlugin.test.ts` (4; two failed with the check switched off); websiteLogin, websiteRules and twoFactor integration tests run in CI. Server fast tests 97 pass.

- CI of `2d63b1c` (run 45701234922): two failures. (1) `hostNav` phone bar, Firefox and WebKit: at 360 px and 150 % font the toggle took a row below the Menu button (reproduced 3 of 3 in Firefox). The kit's v0.22.0 folded header lets the Menu stay beside the brand and the toggle wrap alone where the brand is narrow (a browser without a scrollbar's width), though its change log says they take a row together; the only way to stop it is to override the kit's brand rule (the very lines piece 2c dropped), which the kit rule forbids. The check follows the kit there (150 % only: nothing covered, the bar at most 200 of 800 px; at 100 % one row as before). **Kit wish:** the folded header keeps Menu and toggle in one group that wraps together. (2) `account.spec` "a wrong password ..." timed out once in Firefox (the e-mail field never appeared after the click on "Sign in"); 3 of 3 local Firefox runs pass; no cause found, watched in the next run.
- Piece 5, backups (built, drills running): `ops/lib/kit-backup.sh` is the kit's `ops/backup.sh` byte for byte (test `kitBackupCopy.test.ts`); it lives in `lib/` because `sbr update` installs the new version with the old installer's file list (`lib/*.sh` yes, a new file at `ops/` no: the backups would have failed on every updated server). `ops/lib/backup.sh` (248 to 262 lines) is now Bingo's settings (`SK_BACKUP_PREFIX=sbr`, the two keys as secret files, schema `sbr`, the uploads volume without the maintenance flag and the feed status), the restore around the kit's functions (every refusal first, stop the app, the kit's one-transaction restore, `apply_db_roles`, uploads, keys), the drill (the kit's, then the seed-key check) and the timer. **Two points where the kit did not fit:** (a) it cannot read a backup made before it (`uploads.tar`, `seed.key`, no manifest): Bingo's script unpacks both forms; (b) its own `restore` refuses a differing secret file only after the database has been replaced (`do_restore`: `restore_database`, then `restore_secrets`), so Bingo checks the seed key before calling the kit's functions. **Kit finding to fix.** Old-script rehearsal (nginx, website `cc743b9`): all 126 checks passed; its backup, key and data fingerprint (3 accounts, 3 matches, 139 events) are kept outside the repo in `C:/Users/weudl/sbr-review/kit22-backup-old/`.
- Piece 6, the game bar: `git grep` finds no `GameBar`, `usePanels`, `useFocusMode` or `bar.css` in `apps`, `packages`, `e2e`, `ops` (the `sk-bar-button` hits are the header's buttons): Bingo uses no kit GameBar; nothing changed.

- Piece 5, the drills (2026-11-25/26; nginx mode, real website `cc743b9`; nothing on a VPS). Old script (head `2d63b1c`): rehearsal all 126 checks passed. New script (head `0661668`): all 127 checks passed, with the new `sbr restore --drill` in it: the kit's drill 29 tables, every row count equal, 1 volume copy, 2 secret files; Bingo's drill 26 migrations, 3 accounts, 3 matches, 177 events, the seed key opens the newest sealed match seed. **The old backup restored by the new script** (`sbr restore <old> --identity <key> --force-env`) on the rehearsed server: before the restore that server held 3 accounts, 3 matches, 177 match events; after it 3 accounts, 3 matches, 139 events (players are the accounts), the app ready. `matches` and `match_events` have the same row hashes as the old install's (`89f7204…`, `7a12f7c…`); `accounts` equals the rows inside the old backup itself (`fbcc441…`, loaded into a throw-away database), which differ from the hash taken after the old rehearsal's later phases. The new script's drill also reads the old backup (warns that only Bingo's drill does). A first run of the new rehearsal failed before the game was reached: its browser step clicked "Register" while the website's navigation showed a second such link; the step now takes the login page's own link (`ops/test/realSite.spec.ts`). The old backup, its key and fingerprint stay in `C:/Users/weudl/sbr-review/kit22-backup-old/`.
- Piece 7: docs/concepts/kit-adoption.md §9, the table of every part still Bingo's own with its reason or the kit release or wish; BACKLOG and OPEN aligned.
- CI: run 45709785633 on `cd2f5a4` green in every job (the earlier red run 45701234922 and the cancelled 45709608742 are explained above).
- Piece 8, the look (website sweep and standalone audit of the result and the player's round, light and dark, 16 px and 32 px root font, at 360×780, 390×844, 1280×720; the player had three step badges; throwaway specs, not committed). **16 px:** header order back, brand, Menu, toggle (folded), nothing covered, nothing past the window; results places whole above the strip 5 at 1280×720 (floor 7 not met, see piece 2a), 6 at 390×844, 5 at 360×780; findings: the clipped descender of "Final placement" at 1280×720 (kit headline), and at 360×780 the player's card ends below the game area (it scrolls and says so). **Found with the pictures:** (1) with three step badges the header **folds into Menu at 1280×720** (organizer; without badges it stays unfolded; unfolded again from 1366): the kit's measured fold. (2) The player's own Standings row wraps its points onto a second line when the member has step badges beside the name (the one-line fix of 2026-11-25 was measured without badges). **200 % font:** (3) at 1280×720 the player round's **title and status text lie over each other** and the first column is about 140 px: the side column's minimum `13 × --sk-space-4` is 1040 px there (`shell/dockSide.css`, on master since PR #72; not from this branch; a one-line fix: cap it with `min(…, 55%)`; not changed, the owner looks first); the results screen shows no place above the strip. (4) On phones the kit's chat bar text stays 14 px while the page's text doubles (kit). (5) Phones: the player's card is wider than 390 px (sideways scroll, standalone and website). 200 % was not measured on master before, so (5) and the standalone page scrolls are not compared. Standalone, 16 px: findings only the "Final placement" descender at 1280×720 and the phone round's page scroll (as before).
- Pictures (18) in `C:/Users/weudl/sbr-review/kit22/`: results and player round at 1280×720 and 390×844, light and dark; both at 1280×720 with 200 %; header at both sizes and the open menu at 390×844.

### Fix round of 2026-11-26: stopped after piece 1

The owner stopped the round: the kit planning will tag a release that carries Bingo's findings (live `FailureBrake` with a reserve, restore order, dense `ResultFrame`, badges that give way before the header folds, Menu and toggle as one group, chat bar text that follows the font size), and Bingo moves once, onto that release, later. Only the piece in hand was finished. Nothing more changes on this branch until a new block.

**Done: piece 1, large fonts.**

- The match screens' desktop layouts (player, spectator, results, host console; standalone and docked) now ask the page's width in root-font steps: a `page` container on `.shell-main` from 960 px (`shell/shell.css`), `@container page (min-width: 48rem)` in `arena.css`, `watch.css`, `host.css`, `dockSide.css`, `dockWatch.css`, `dockResults.css` and for `.fit-window` in `shell.css`. At 32 px they stack up to 1536 px wide (side column below the play area, the page or the game area scrolls); 16, 20 and 24 px are as before. At 1900 and 1920 px they keep their columns, and the side panels no longer shrink under their text (`dockSide.css`: `max-content` rows; the seasons note ran under "Patterns this round" at 1900×860).
- The player's card on a phone is never wider than its box (`liveCard.css`): it hung 36 px past it at 390 px and 32 px font. The rule was Bingo's and is the same on `master` `d7d841e` apart from token names (compared in the source; `master` was not run).
- Test: `e2e/chatEmbed.spec.ts` "at a large font the match screens stack under the dock", failed before each of the three changes; it and `playerFit.spec.ts` pass in Chromium.
- Website sweep (console, player, spectator, three results screens; six desktop sizes, 360×780, 390×844; 16 and 32 px; light and dark; 24 px in the run before the last two changes): desktop axe 0, no sideways scroll, no overlap but one probe flag on the ball cut at the scroll edge (console, 1366×768, 32 px). Standalone royale audit (1280×720, 1366×768, 1920×1080, 390×844; 16 and 32 px): no overlap on desktop; at 32 px the round pages scroll.
- What it costs at 200 % on 1280×720: under the chat strip only the title and the ball are in view, the card is reached by scrolling; no result place is above the strip.
- Pictures in `C:/Users/weudl/sbr-review/kit22/`, retaken: player round and results at 1280×720 light (normal and 200 %), player round at 390×844 at 200 % (its card is below the fold; the test measures it). The other pictures there are from before this round.

**Stopped: piece 5, the Firefox failure (cause found, not fixed).** The trace of run 45701234922 shows no sign-in request at all, so `FailureBrake` is not involved. Playwright aimed at "Sign in"; the lazily loaded "Dev sign-in" menu then arrived and pushed the account links left; the pointer was over "Register" when it clicked down or up, so neither link was activated (the last screencast frame shows `#/register` under the pointer). Development builds only. Proposed fix: keep the account row hidden until the dev menu has loaded (`shell/Header.tsx`). A test that holds the module back is drafted.

**Not started:** piece 2 (one badge in the header) and piece 3 (no badges beside names): no source change; their drafted tests, with piece 5's, are outside the repo in `C:/Users/weudl/sbr-review/kit22-stopped/`. Piece 4 (keep the kit's result frame) needed no code; kit-adoption §9 was not edited. For piece 2 when it comes: the website orders no step across its three ladders, so "highest" needs the owner's word (the first as sent is the simple choice). For piece 3: the leaderboard, the profile and the waiting room show badges beside names too.

**Noticed, left alone:**

- Phones, 32 px: the spectator's watched cards scroll sideways in a row that is no tab stop (axe `scrollable-region-focusable`, `.watch-grid`); standalone, the host-link row in the player's header and the console's controls are wider than 390 px.
- After the root font changes on an open page the console's game area can scroll by a few pixels at 16 px (also measured before this round's changes; none when only 16 px is measured; cause not traced).
- The fit probe misses a partial overlap under a quarter of the smaller box (the 200 % title overlap), so the new test measures boxes instead.
- The kit's result headline is clipped at the descenders, and its chat bar text stays 14 px (both among the kit's findings).

### Running

- CI on the branch's last head.

### Open

- Kit wishes (docs/concepts/kit-adoption.md §9): dense `ResultFrame` and headline line height; folded header keeps Menu and toggle together; `FailureBrake` with a live rule and a reservation; backup restore refusing a differing secret before replacing the database; chat bar text growing with the font.
- The points (1), (2) and (4) of piece 8; (3) and the card of (5) are fixed (fix round above).

### Needs the owner's word

- Look at draft PR #76 and the pictures; merge or not.
- The floor of 7 places at 1280×720: the kit's frame shows 5. Wait for a dense kit frame, or accept.
- The header folding at 1280×720 for members with three badges, and the wrapped own row with badges.
- The 200 % overlap on master: fix on this branch or separately.

## 2026-11-25 (unattended chain: merge #72, HSTS docs, the flaky fit test, the seasons overview)

### Done

- Step 1: PR #72 merged (merge commit `dd35d08`, CI of the head `996df34` green: run 45564339611); BACKLOG KIT-ADOPTION remainder and OPEN state what K18 landed and what stays open; branch deleted on origin and locally. CI of the merge SHA on master: run 45565377695 (checked before the next merge).
- Step 2 (branch `docs/hsts-closed`): prod-readiness §8 closed with the website's reference (seasonal-entertainment master `046ec70`, PR #88, `max-age=31536000; includeSubDomains`, no preload, live at the next installer `--update`); the HSTS entry moved from BACKLOG part one to part two; OPEN aligned. Docs only, no browser checks.
- Step 2: PR #73 merged (CI green: run 45565548605; merge `69e2516`); CI of the step 1 merge SHA `dd35d08` on master: success (run 45565377695). Branch deleted.
- Step 3 (branch `fix/console-phone-fit`): **cause found.** The host console on a phone puts the newest event lines (`.arena-events`, banners such as a season collected, with the log's summary line) above the controls. They come and go with the random draws: none in all 18 local runs, but three lines with the summary are about 100 px, so Draw next's bottom moved from 541 to 652 px at 360×640 (the CI failure was 644.05 against 640.5, two lines). Reproduced deterministically by injecting three banner lines into the empty events block on master's code (Draw next bottom 652.4, over the limit). **Fix in the screen** (`apps/web/src/host/host.css`, under 960 px only): `.host-play` gives its children to the grid and the events line block moves after the controls (`order`), the standings after it; with three injected lines Draw next now ends at 533 px, the same as with none. The limit and the spec are unchanged, no retries. Proof: `playerFit.spec.ts:268` with `--repeat-each=10`, nothing else running: 10 passed. The old code cannot be made to fail by repeating alone (the banners are random: 0 of 18 local runs had any), only by the injection above (it fails, 652.4 px). The phone console's gaps changed by 16 px (the section's own gap of one step became the grid's); nothing at 960 px or more changed.

- Step 3: PR #74 merged (CI green: run 45569386594; merge `8d20904`); CI of that merge SHA on master: success (run 45570680835). Branch deleted.
- Step 4 (branch `feat/seasons-overview`, draft PR, **not merged**: the owner looks first): the seasons overview in the waiting room of a royale match. `game/SeasonsOverview.tsx` (new): a disclosure "What the seasons do", one line per season with icon and name from the match's frozen ruleset (`result.seasonEffects`, `seasonCompletePoints` of the client view that the waiting room already holds), and "Collect them all: all four give +300 (Season Complete)"; royale only (nothing in Season-Bingo and Number-Bingo); standalone and website mode alike. **Reused:** `seasonName`, `boostSentence`, `growthSentence`, `shieldSentence`, `seasonCompleteNote` (`game/seasonText.ts`), `SeasonIcon` and `SEASON_MARK_SIZE` (the one season mark), the `sbr-stack` layout. **Added:** `seasonOverviewLine` in `seasonText.ts` (a dispatcher that calls the three helpers with the effect's full duration or charges; the Autumn harvest, a bonus, a preview and "no effect" had no sentence of their own, so they got one each there, in the same words), `useDesktopWidth` (the 960 px phone breakpoint as a hook; there was none). **Placement:** the waiting room's body is a grid: on a phone the disclosure sits above the players, closed; from 960 px it is open in a column beside the players, Join and the registration line, so its height never pushes Join down. A first version above the players pushed Join to 527–591 px in the 538 px game area at 1280×720 with the chat strip (out of view); beside them Join is at 327–391 px. Kit tokens only (`game/seasonsOverview.css`), text 14 px. Test `game/seasonsOverview.test.tsx` (3: four seasons with the ruleset's numbers, a changed ruleset shows its own, absent in both other kinds; failed once before: the component did not exist). Spec: `docs/spec/01-game-design.md` §7.6 (row "Waiting room, seasons overview"); BACKLOG part one entry SEASONS-OVERVIEW; OPEN aligned.
- Checks: website sweep, `console-lobby` and `waiting-room`, ten sizes, light and dark, chat closed and open (80 measurements): findings 0 and axe 0 on all desktop sizes and on the phones with the sheet closed; the 16 findings are phones with the chat sheet open, where the sheet covers the page by design (the known baseline). Standalone audit at 1280×720 and 390×844 (16, 20 and 24 px fonts): lobby, lobby-guest, console-lobby and waiting-room findings 0 (the audit measures light only). Lint, typecheck and the web tests (65 files, 302 tests) pass.
- Pictures in `C:/Users/weudl/sbr-review/seasons/` (4): waiting room of a royale, website mode with the chat strip, 1280×720 light and dark; standalone 1280×720 light; website 390×844 light. In all four the Join button is in view and the overview shows the four seasons (closed on the phone).

- End of the chain: the dev server runs on `feat/seasons-overview`, standalone (port 5390, build badge "Bingo · dev · 5390"; the client serves `src/game/SeasonsOverview.tsx`, HTTP 200). To open a royale waiting room yourself: `http://localhost:5390/#/quicktest/play` (the Quick Test page's "Test a match": Battle royale, start in N minutes, "I play along" off); this tab then shows the waiting room with the seasons overview. `C:/Users/weudl/sbr-review/docked/` is deleted. `git ls-remote --heads origin` at the end: `master` `8d20904` (merge of PR #74), `feat/seasons-overview` `30b6a82` (the commit before this note; draft PR #75), `renovate/digests-pin`, `renovate/minor-and-patch-updates`; `fix/console-phone-fit` is gone (step 3 found the cause and merged).

- Step 4, closing (owner decision of 2026-11-25, the overview's wording): the waiting room's "What the seasons do" no longer uses the running-status endings. A timed effect reads "Summer boost: your marks and speed bonus count ×1.5 for 8 numbers" and "Spring growth: every mark earns extra points, more with each mark, for 10 numbers"; the shield reads "Winter shield: saves you once at a cut if you are at most 3 places below the line" ("N times" when charges are more than 1), no "left"; all numbers from the frozen ruleset. In `game/seasonText.ts` each effect's words are one shared part (`boostWords`, `growthWords`, `shieldWords`) with two endings: the status panel's ("— 5 more numbers", "— 1 left"; `boostSentence`, `growthSentence`, `shieldSentence`, unchanged output, `seasonText.test.ts` and the status panel tests pass unchanged) and the overview's (`seasonOverviewLine`, `forNumbers`). `seasonsOverview.test.tsx` checks the new wording (failed on the old code, also a two-charge shield). PR #75 is marked ready and merged on green CI; SEASONS-OVERVIEW moved to BACKLOG part two (closed by PR #75), OPEN aligned. The pictures and `sbr-review/seasons/` are deleted with the stale `sbr-review/tmp/`; the dev server runs on master.

### Running

- Nothing.

### Open

- Nothing: step 4 is merged (owner decision of 2026-11-25, after the wording change).

### Needs the owner's word

- Nothing.

## Night of 2026-11-23/24 (unattended)

Pieces: 0 open sign-ups capped at 20, 1 H3 header comments, 2 T4 eliminated-cannot-mark journey, 3a axe focus, 3b docked layout, 4 start card, 5 game bar and focus mode. Pieces 0–2 merge when CI is green; 3–5 stay on `feat/docked-layout` for the owner's look.

### Done

- **Piece 0, open sign-ups capped at 20** (branch `fix/open-rounds-cap`, owner decision of 2026-11-23): `MAX_OPEN_ROUNDS` (new export, `packages/contracts/src/http/openRounds.ts:19`) is the answer's cap and the end of the setting's range (`packages/contracts/src/config/screens.ts:39`, was 1–100); the admin description says the website shows at most 20. The test failed first (the export did not exist; 21 was accepted), passes now; contracts tests 41/41, typecheck passes. Nothing stored or seeded was above 20: the dev database's `screens` document (version 3) holds 20, no fixture names the setting. For an install that did store more than 20, `screenSettingsOf` would read every screen value at its default until saved (the same rule as for any out-of-range value); none exists, and the production install is not made yet. Docs: admin-values.md (range, line references), kit-adoption.md §8, BACKLOG part two (OPEN-ROUNDS-CAP). **Merged** as `bc76aba` (PR #69, CI green on `8d43847`); master CI 45284095834 green on `bc76aba`. The branch is deleted.

- **Piece 1, H3 header comments** (branch `chore/h3-headers`): 124 files had a Responsibility block over 8 lines (the audit counted 34 in November; the worst list in the task was stale, `cli.ts` 21, `fitAudit.spec.ts` 21 and `liveSteps.integration.test.ts` 20 were as long as `website-vps.sh` 29). All are 8 lines or fewer now, 1395 → 980 block lines; the five worst: `ops/test/website-vps.sh` 29 → 8, `apps/server/src/cli.ts` 21 → 8, `e2e/acceptance/fitAudit.spec.ts` 21 → 8, `apps/server/test/liveSteps.integration.test.ts` 20 → 8, `ops/test/real-site.sh` 20 → 8. Five helpers rewrote the blocks in parallel; a checker compared every file with master with the block removed: 124 of 124 identical outside it, every block 8 lines or fewer, no line over 100 characters. Lint and format check pass. Master's CI on piece 0's merge commit (`bc76aba`) was green (run 45284095834). Small details that went (all also visible in the code or the cited docs): `website.sh` the Docker network choice and the `sbr status` list, `config.sh` the list of secrets, `websiteRoute.sh` the identity header list and cookie names, `website-vps.sh` the individual checks, `drawRun.mjs` its sampling details, `liveHeld.ts` the `applyStep` field list. `cli.ts` kept `loadcheck`. **Merged** as `3b8a58e` (PR #70, CI green on `db0f75d`); the branch is deleted.

- **Piece 2, T4 the eliminated player's browser journey** (branch `test/eliminated-cannot-mark`): `e2e/eliminatedPlayer.spec.ts` (reuses `signIn`, `hostMatch`, `joinFromLobby`, `fillAndStart`, `stopMatch`, `closeContexts` of `e2e/realGame.ts`): a royale with the fast rules, 8 players, the host drawing every 4 s; player 1 never taps and is cut after round 1 ("You're out in cut 1"); before the cut their card cells are buttons with the tap line, after it their screen has no `owner-cell-*` and no tap line, the watched cards hold no button, a click on a watched cell changes no mark, and the page sent no `mark` frame after the cut. It **passed at once** (1.7 min), so there was no fix to make; with the own-or-watching branch of `MatchScreen` switched off it fails (the watched cards are gone), restored. The e-mail verification journey stays out (the flow is not built); said in BACKLOG, whose "Audit 3" entry is closed.

- Piece 2 **merged** as `2380ea7` (PR #71, CI green on `d178774`); the branch is deleted. Master's CI on piece 1's merge `3b8a58e` was green (the first "exit 1" of the watcher was GitHub's API rate limit, three watchers polling every 3 s).
- **Piece 3a, the axe finding** (branch `feat/docked-layout`, draft PR #72, **not merged**): the drawn numbers (`DrawTicker`) are a named region and a tab stop, the standings list a named list with a tab stop (a region role would take its rows out of the list; the task said region, kept the list). `scrollRegions.test.tsx` failed first (4 of 4 cases).
- **Piece 3b, the docked layout**: the kit's `DockedScreen` with `WebsiteChatFrame` around the lobby, the match screens and the console in website mode (`shell/DockedChat.tsx`, `shell/dock.css`); `ChatDock.tsx`, `chat.css`, the header's chat button, `sbr.chat.open` gone; standalone unchanged. The sweep on the new layout (480 measurements, fit-audit.md §8): **the chat covers 0 game text at every desktop size** (§7: up to 58); the player's and the host's screens fit above the strip **even at 1280×720** (game area 457 px above the 150 px strip); **not whole**: the spectator's (and an out player's) four watched cards at **1280×720, 1366×768 and 1536×768** (area 457–465 px; they fit from 557 px, so they need between 466 and 557 px): their box scrolls and the strip stays in sight; nothing under 14 px or 16 px was made. What would give room: the top two beside each other at those sizes, or a "show more", or a shorter header; the strip itself cannot go under 150 px (the owner's least) and is the kit's. Phones: the chat bar is inside the window in all 192 phone measurements, the sheet opens and closes; the round screens scroll inside the area as they scrolled the page, and the player's card is not whole above the bar at 375×667 and now also 360×780 (the bar takes about 70 px). axe: `scrollable-region-focusable` gone (192 of 480 before): besides 3a the shorter area made the patterns panel, the status panel and the cards' box scroll at 1280×720; they are focusable and named too; one `color-contrast` hit, the podium still fading in (first measurement of that screen, as in §7). Tests: `dockedChat.test.tsx` (rewritten), `scrollRegions.test.tsx`, `e2e/chatEmbed.spec.ts` (rewritten: strip, theme, reload, bar and sheet) and `backToWebsite.spec.ts` pass in Chromium; the website-mode sweep helper counts the game area's scroll, keeps key boxes inside it, records the chat bar and takes `SBR_SWEEP_SIZES`. The two wrong sentences (kit-adoption.md B7, fit-audit.md §7) are corrected: the kit puts the chat under the game (kit `ChatDock.tsx`).
- **Piece 4, the start card: kept, not built** (the rule: no kit patch). The kit's `StartCard` clips its content (`.sk-start-card { overflow: hidden }`, kit `css/frames.css`; the title in the largest type) and always prints "Opens in N s" (`opensIn: number`). Bingo's waiting room is a list of up to 100 players that must scroll, a Join action and, in most matches, no start time (the host starts it, or the places fill). **Wishes for the kit:** (1) `opensIn: number | null`, no timer line when null; (2) a scrolling variant of the card (or of its special block) for lists; (3) the fit scale off for a game whose floor is 1 (Bingo). Nothing was changed in the waiting room, so no sweep for it.

- **Piece 5, the game bar and focus mode: dropped, not started** (drop order). Open design questions: (1) the kit's `GameBar` has no panel container; the panels' content is the game's, so which of Bingo's panels (standings, patterns, status, chat) go into it and which stay in the arena? (2) focus mode takes the account name and sign-out out of the header; where do they live while it is on? (3) the task's `BingoHeader.tsx` is only the letters row above a card, the real bar is `ArenaHeader` / `ConsoleHead`; which one is meant? (4) the organizer's bar at 1280 px in website mode must stay one row.

### Running

- Nothing. CI of the draft PR #72 and the pictures: see the closing line below.

### Open

- Piece 5 (above). BACKLOG's KIT-ADOPTION remainder stays in part one: B7 step 1 (docked layout) is on draft PR #72, step 2 (start card) is kept as Bingo's with wishes for the kit, step 3 (game bar, focus mode) is dropped.

### Closing state (2026-11-24, evening, after the side column; the stand-in fix of the afternoon below it)

- **Draft PR #72 CI is green** (run 45420189865 on `f97544e`: all e2e jobs, verify, docs, security). **Cause of the red afterAll** (timing logs, run 45417850135): `removeAccounts` took 50 ms; then `child.kill()` and the game server did not exit for 90 s, while the stand-in's proxy held one open connection until the hook timed out. A page left open (the spec's player and guest contexts; with the docked layout every game page mounts the chat frame and the live socket) kept a socket; the server's shutdown waits for its open connections and `proxy.close` waits for the same one, and `closeAllConnections()` does not end upgraded sockets. **Fix** (`f97544e`, `e2e/websiteStack.ts` only; the game is unchanged, a graceful shutdown waiting for open connections is right): the stand-in tracks every client socket and destroys them before it stops the server, both ends of an upgraded pipe close together, and `close` waits for the child's exit and the proxy's close. The hook timeout is not raised; the temporary timing logs are reverted.
- **The picture run's hang was a second, separate cause**: in `e2e/acceptance/websiteSweep.ts` `barInWindow` called `boundingBox()` on the chat bar, which a desktop window does not have; `boundingBox()` of a missing element waits without end, so the sweep never took its first measurement. It now looks only at a bar that is shown. The run after the fix took 9.5 min and passed, with no hang at its end.
- **First review pictures** (website mode, light, chat shown; 1280x720 and 390x844): `C:/Users/weudl/sbr-review/docked/before/` (master `2380ea7`, 8 files) and the branch's first set, which found the overlaps below and is replaced by the new `after/` (last bullets). Master has no `SBR_SWEEP_SHOTS`, so its run used the hook as a local, uncommitted patch of the helper. On master the chat is the panel opened with the dock's toggle: its pictures show that panel open, not a strip.
- Dev server: on `feat/docked-layout`, started again with `pnpm dev` (it was not running; SBR's Docker containers `sbr-dev-*` had stopped and were started). Port 5390, build badge "Bingo · dev · 5390", standalone, so the docked layout (website mode only) is not visible there. Quick-Test seed `kit-011`.
- **Side column beside the title** (owner decision of 2026-11-24, docked layout, website mode only; kit-adoption.md §8 "K18 step 1b", fit-audit.md §8.1): the player's and spectator's side column (status and seasons, "Patterns this round", standings) and the console's standings start directly under the LIVE badge, beside the title (`shell/dockSide.css`, new; every rule under `.sk-docked-main`, desktop from 960 px; standalone untouched, its fit audit at 1280×720 shows the same findings as before). "Patterns this round" shows all rows at 1280×720 and 1366×768, the standings get the rest. The three overlaps of the review pictures are gone (patterns over the seasons line; the console's ball over its rules line; the cut standings), no pair of game elements intersects at the six desktop sizes (a box comparison of the touched elements, not committed). Draw next is 4 rem high in the console (was 5.5 rem) so Draw next, the switch and Abort are whole at 1280×720.
- **The sign that a box continues** (the kit and Bingo had none, so it is new): `useScrollHint` + `components/ScrollBox.tsx` + `scrollHint.css` draw "↓ More below" at the bottom edge of a scrolling box, under the dock only; on the game area (so the results screens' podium, which lies below the area's edge by design, and the phone screens say it), the cards' box, the side column, the standings list and the console's controls. It takes no room and is empty for a screen reader. Test: `components/scrollBox.test.tsx`.
- **The spectator's four watched cards are whole** (owner decision of 2026-11-24, part A; kit-adoption.md §8 "K18 step 1c", fit-audit.md §8.2; `shell/dockWatch.css`, new): all four cards, two by two, box scroll 0 at all six desktop sizes, the out player's watching view the same. Step 1 (cell floor `--space-3`, no heading gap, letters at the small size): the cards need 383 px instead of 431, against 336 / 342 / 342 px at 1280×720 / 1366×768 / 1536×768, so 47 / 41 / 41 px short. Step 2 (the title and the stage line on one line at the lead / small sizes, the rules line under them; the block 57 px instead of 121 px): the box has 396 / 404 / 404 px, enough. Step 3 (the ball) was not needed. A followed card keeps its own layout.
- **More places on the results screen** (part B; `shell/dockResults.css`, new): places whole above the strip (podium steps and ranked rows) at 1280×720, 1366×768, 1536×768, 1440×900, 1900×860, 1920×1080: before 2, 0, 0, 5, 4, 9; after 7, 7, 7, 12, 11, 20. The kit's `ResultFrame` at the next kit adoption must show at least as many (7 at 1280×720); until then Bingo's panel stays.
- **The kit rule** (owner decision of 2026-11-24) is kept in both parts: every size, spacing, gap, padding, radius and type size set or changed is a kit token or a whole number of the kit's spacing steps; no kit part was changed. The old non-token values of `dockSide.css` and `scrollHint.css` were replaced (old to new in kit-adoption.md §8, K18 step 1c). **No pixel was missing at any size**, so no wish is needed to reach the goals. Wishes for the kit planning that would make the code plainer: (1) a spacing step below `--space-1` (0.25 rem): the card padding, the row padding and the sign's offsets are now 0 or 0.5 rem, with 0.25 rem between they would not have had to give up the gap between a card's heading and its letters; (2) size tokens for layouts (a column width, a minimum area height, a cell size): the side column (8 × `--space-4`), the play row minimum and the console's columns are multiples of `--space-4` now; (3) a dense variant of `ResultFrame` (places one line high, no gap). What stays raw, because a token cannot express it: the 960 px breakpoint and the 46 rem podium breakpoint (media and container queries take no variables), unitless ratios (the cell font is 0.36 of the cell), container units, 1 px borders.
- **Season marks, podium seasons, looser results side column** (owner decisions of 2026-11-24; kit-adoption.md §8 "K18 step 1d"): earned season = coloured icon, not earned = empty grey ring, one size (`--font-size-body`) everywhere (rows, standings, podium, "Seasons this match", the interlude's Season Complete); places 1 to 3 show their four marks (white ring on the coloured steps); the interlude's podium has no seasons data (the recap has points only), so it shows none: a server change would be needed. The results screen's side column is loose (kit steps), only there. Tests: `components/seasonMarks.test.tsx` (3, each failed before the change). Places whole at the six desktop sizes: 7, 6, 7, 12, 11, 20. The sweep now also logs `places` (the results screen's places above the strip).
- **White disc, Patterns beside Standings, the sign in its own band** (owner decisions of 2026-11-24; kit-adoption.md §8 "K18 step 1e", fit-audit.md §8.3): a season not earned is a white disc with the grey ring (kit tokens; in dark mode the same tokens give a dark disc with a lighter ring, no override); "Patterns this round" and Standings stand side by side in the player's and spectator's side column, Standings with the column's whole height: rows whole at 1280×720 player 1 to 7, spectator 5 to 7 (7 to 8 at 1366×768 and 1536×768); "More below" is a strip with its own opaque band at the bottom edge, never a pill over the last line (test `e2e/scrollSign.spec.ts`); on the results screen the heading and "You finished #N of M" share a row so 7 places stay whole. Sweep: 48 measurements light and dark, findings 0, axe 0. Pictures: `C:/Users/weudl/sbr-review/docked/after/` now holds 9 files (player round, spectator round, results and console at 1280×720, `-light` and `-dark`, and results at 1920×1080 dark); the older pictures there are deleted, so the "10 files" of the bullet below is out of date.
- **White disc in both themes, one-line rows, the sign** (owner decisions of 2026-11-25; kit-adoption.md §8 "K18 step 1f"): the not-earned disc is `--color-on-live` (white in light and dark; `--color-surface` and `--color-on-solid` are navy in dark); the podium's white ring for earned marks uses it too. Ranked rows in Standings and the final placement stay one line by room (a wider Standings half, closer rows), not by an ellipsis: the task asked for an ellipsis, but `minTextSize.test.ts` (owner rule F7: a name is never cut) forbids it, so names are whole; `wrapped` rows in the sweep: 0. **Question for the owner:** if a very long name must still stay on one line, F7 would have to be relaxed for the dock. **Question for the owner:** the "More below" sign on the results screen at 1920×1080 is correct, not a leftover: below the final-placement panel the screen still holds the final ball, the drawn numbers and the owner's card (the play-area row); to make the area stop scrolling there, that content would have to go or move (a design decision), so it stays. Sweep: 36 measurements (player, spectator, results; light and dark; six sizes), findings 0, axe 0. Pictures: `C:/Users/weudl/sbr-review/docked/after/`, 7 files (player round, spectator round, results at 1280×720 `-light` / `-dark`, results at 1920×1080 dark).
- **Pictures** (website mode, light, strip shown; the phone with the sheet closed), `C:/Users/weudl/sbr-review/docked/after/`, 10 files (spectator-4 and results-player at 1280×720 and 1366×768 retaken after parts A and B: all four cards whole, no overlap; 7 places whole on the results screen, the rest behind the "More below" sign; the stale `new/`, `tmp/` folders are deleted): player round, spectator round, results and host console at 1280×720 and 1366×768, and player and spectator round at 390×844. Each was opened: no two game elements overlap in any of them; the "More below" pill lies over the last visible line of a cut box (the standings in six, the watched cards in two, the final placement's list or podium in two, the game area in both phone pictures), which is what it is for; all four pattern rows are visible in the player and spectator pictures. The sweep hook now takes `SBR_SWEEP_SCREENS`, `SBR_SWEEP_THEMES` and `SBR_SWEEP_CHAT`, and `SBR_SWEEP_SHOTS` saves every size it measures (a desktop with the strip, a phone with the sheet closed). A narrowed run takes 10–11 minutes (the match play-through is most of it).
- Not merged; the PR stays a draft.

### Needs the owner's word

- The docked layout itself (draft PR #72): the owner looks first.

## Production night of 2026-11-22/23 (started 23:13, unattended)

Owner decision of 2026-11-22: prepare everything up to the VPS move; nothing on the real VPS; nothing a player sees changes.

### Done

- **Piece 1 merged**: PR #58 as **`be3f5de`** (merge commit, kit v0.10.1). Before it, on `5c613c0`: the 48 screens (standalone and website mode, 1280×720, 959×700, 390×844, light and dark) pixel for pixel the same as master `c1bab70`; lint, typecheck, format, minTextSize, playerFit (Chromium, 4/4) pass; a short royale played to its final placement on desktop and phone (fast profile); verify 928/930 with two timeouts while other projects loaded this PC (`royale.properties` invariant 10, `matchViews` watched cards: both pass alone, 12 s and 74 s); CI 45073180487 and CodeQL 45073180468 green. On `be3f5de`: CI 45102013233 green **including the security job** (the `.gitleaksignore` entries came with the merge), CodeQL 45102013097 green. The branch is deleted on origin and locally.
- Piece 2 (branch `test/rehearsal-final`, PR #62), website master `e71c654`, all fresh: nginx on master `be3f5de` **63 PASS / 0 FAIL**; caddy with the new backup-and-restore drill at `8fd1639` **100 PASS / 0 FAIL**; nginx with the drill and the new `sbr rollback` step at `f3f9177` **126 PASS / 0 FAIL**. The drill restores the backup into a fresh server with `--force-env` and finds the 18 data tables, the settings History, the recovery key, a stored recovery code (the app's new read-only `check-recovery-code`; its lookup test failed first; the check failed under another key on the kept server before it passed), the seed key and the played match. A gitleaks finding on the harness test key in `8fd1639` is ignored like the same line in `60ebca7`. Local verify 925/925 (one test file's worker did not start under load; `startRules.test.tsx` alone 6/6). **Merged** as **`4650405`** (PR #62, CI 45120040934 and CodeQL green on `728484f`); master CI 45120901407 and CodeQL 45120901304 green on `4650405`. The branch is deleted.
- Piece 3 (branch `chore/prod-audit`, PR #63), master merged in (`bfdd9ba`): fresh rehearsals with the drill and the rollback, website `e71c654`: **nginx 126 PASS / 0 FAIL, caddy 110 PASS / 0 FAIL** (the install now ends with "1. The website's admins are the game's admins…"); local verify 934/934. Written up in docs/concepts/prod-readiness.md; fixed (each with a test that failed first where code changed): no e-mail address in the log of a failed mail, a website install's next steps without `create-super`; the guide's own-Caddy uninstall line; the stale osv ignore. **Merged** as **`3c0888d`** (PR #63, CI 45127817963 and CodeQL 45127818040 green on `1be4bcf`); the branch is deleted. Master CI 45128837895 and CodeQL 45128837879 green on `3c0888d`.
- Piece 4: docs/GO-LIVE.md (the steps, the three answers, the expected output, `sudo sbr status` from the rehearsal's server, the website admin's steps, the first browser checks, what to do when a step fails, rollback included). **Merged** as **`890b568`** (PR #64, CI 45129188466 and CodeQL 45129188567 green on `463582f`); master CI 45130406519 and CodeQL 45130406370 green on `890b568`. The branch is deleted.

- Piece 5 (branch `test/sweep`, PR #65): the website-mode sweep (docs/concepts/fit-audit.md §7), measured twice with the same findings, 480 measurements each: with the chat closed no finding; with it open the chat covers the match below 1900 px; axe `scrollable-region-focusable` (serious) on the drawn numbers and the standings of the results and interludes and the console's round, and one `color-contrast` hit on the interlude's podium while it fades in. `atSize`, `ROUND_KEYS`, `keysOutOf` and `findingsOf` moved to `e2e/acceptance/fitMeasure.ts`; the standalone maintenance test passes with them. New development dependency `@axe-core/playwright` 4.14.0 (MPL-2.0). The acceptance spec stays out of CI. The installer's next-steps test now allows 30 s (Git Bash start-up: 0.3 s alone, past 5 s under load). CI 45143831845 and CodeQL 45143831663 green on `0fccc25`. Local verify twice under other projects' load (their e2e run, the kit's coverage, a sweep): only timeouts (container health checks, worker starts, one CLI test); every failed file passes alone (12 unit files 64/64, `auth.integration` 15/15). **Merged** by PR #65 (merge commit); the merge SHA and its master runs are in the night's closing report.

### Running

- Nothing.

### Open

- Nothing.

### Reverted

- Nothing.

### Needs the owner's word

- HSTS on the game's own answers inside the website (docs/concepts/prod-readiness.md §8): the website's Caddy sends it only for its own pages; proposal: the website adds it for the game routes, or the game's route file does.
- `ops/.env.dev.example` and `apps/server/dev.env`: gitleaks finds nothing in them, but their content is not read by the agent (a permission rule here); a glance that they hold no real values.
- The docked layout (K18, kit-adoption §5 B7) can start from the sweep's baseline: the open chat covers the match from 1280 to 1536 px; on phones it stays a sheet.

### Noticed, left alone (this night)

- One merge commit has git's default message without the co-author line: `b4ce28c`, master merged into the go-live branch (amending is not allowed here).
- The guest and member cookie's `Max-Age` is 30 days in website mode, where the server ends a session after 7 (prod-readiness §9).
- Every round screen scrolls the page on a phone in website mode as in standalone (the ball, the numbers and the cards stay in the window).
- Local test runs time out when other projects' work loads this PC (two property tests, a worker start); each passed alone.

## Night chain of 2026-11-22

Started 09:42, unattended: part A, the real-site rehearsal with the admin area (branch `test/rehearsal-admin`); part B, adopting `@seasonal/kit` v0.10.0 (branch `feat/kit-adoption`). Below it, the admin area's night (PR #56, merged as `a1495bf`).

### Done

- Master before the chain: `a1495bf` (merge of PR #56); CI 45002896346 and CodeQL 45002896286 green.
- A1 `e612fb4`: the rehearsal's browser spec covers the website admin in the admin area (P6: Admin, Overview, maintenance on and off with a reason, both in History; maintenance always switched off at the end), "Start a match" from the battle royale preset (P2) and a member without the right refused (P1: 403 `FORBIDDEN`). Reused: `contextOf`, `keep`, `sessionOf`, `signInAgain`, `state`; new `gamePost` (spec) and `storage` (real-site-admin.sh: the admin's cookie jar as a browser storage state).
- A3 fixes from the failed nginx run (website `de057d8`):
  - `ce6ccdc`: the install's output checks (`said_since`) read the results with one awk; the harness's `tail | grep -q` under pipefail failed on the long output (SIGPIPE, exit 141, checked on the failed run's log). P1 waits for the website's Register form (the login page has a Username field too, the name went into it). P6 opens the folded menu first (`openMenu` from `e2e/menu.ts`, mounted read-only into the browser container): in website mode at 1280 px the back link folds the bar for the website admin.
  - `4af5337`: the database healthcheck in `ops/compose.yml` asks over TCP: on a fresh volume the image's temporary init server answered the socket check, and the installer's psql met it stopping ("the database system is shutting down"). `apps/server/test/postgresHealth.integration.test.ts` failed before, passes now.
  - `bcb9602`: the website's admin API grants "may start games" per game now (`POST /api/admin/users/<id>/game-host` with `{"game":"bingo"}`; `/can-start-games` answered `not_found`); the grant, lock, unlock and delete are checks of their own. P6 matches the Admin link exactly (the chip "admin (admin)" matched too).
  - `3afa668`: P2 opens the folded menu before "Host a match" (an organizer's bar folds at 1280 px in website mode). `c81c79d`: P6 opens the menu only once the account is in the bar (it folds then).
- A2/A3 results, website `de057d8` (master), Bingo `c81c79d`: **fresh nginx 63 PASS / 0 FAIL, fresh caddy 53 PASS / 0 FAIL**; the retries on the kept server (KEEP=1 RESUME=1) before them: nginx P2 failed at the folded menu (fixed in `3afa668`), caddy all passed. Earlier fresh runs with FAILs: nginx 57 PASS / P2, P6 FAIL; caddy 52 PASS / P6 FAIL (all fixed above). The later runs ran from a local clone of the branch, so the working copy stayed free for part B.
- A4: BACKLOG Part two (PROBE-REAL-SITE-ADMIN) and OPEN; the operator guide needed no change (no step or output of the install changed).

- Part B (branch `feat/kit-adoption`, PR #58, not merged; docs/concepts/kit-adoption.md):
  - B0 `8c42d31`: the plan re-checked against master `a1495bf`; the kit pinned at v0.10.0 (36a72cf; no install script, licence AGPL-3.0-or-later).
  - B1 `ec1a95a`: tokens, fonts, motion and the theme script and hook from the kit; Bingo keeps its arena tokens, `--gutter`, `--panel-padding`. 30 screens pixel for pixel the same. CI on it red in job `image` (run 45038443991): the server's git dependency needs `git` in the build image; fixed in `fd07a84` by taking the kit into the server only in B4.
  - B2 `0bea630`: the kit's theme toggle and `shell.css`; the back link stays Bingo's (kit request R2: the kit's link drops the space after the arrow). 42 screens (standalone and website mode) the same. CI green after one allowed re-run of Firefox (its two admin specs hung on a flake fixed at its cause in PR #59).
  - B3 `21f2161`: the chat frame is the kit's `WebsiteChatFrame`: sandboxed (K17), `strict-origin`. `chatDock.test` and `chatEmbed.spec` failed first. The real-site rehearsal on the kit branch (nginx, `3754710`, website `de057d8`): **63 PASS / 0 FAIL**, the chat in the sandboxed frame included (send, read, theme). CI and CodeQL green (run 45053727505). Master merged in (`3754710`, the rehearsal fixes of part A).
  - B4 `8bee04d`, `4711b58`, `c6f282f`, `60ebca7`: the server checks from the kit: the website sign-in (`websiteSignInCheck`, `safeNext`, `websiteLoginLocation`; stricter: numeric ids, one role, the contract's steps), TOTP, recovery codes keyed under a new `SBR_RECOVERY_KEY` (K20; codes stored before keep working, K27; made by the install, once by `sbr update`, carried by backups), `SessionEnds`. The rate limiter stays Bingo's (kit request R3: a live rule). The server bundle compiles the kit in (no `git` in the image). Tests that failed first: the role-list test (old code accepted lists), "stores the recovery codes keyed".
  - B5: not adopted (needs the owner's word below).
  - B6 `6cc38c3`: the dev tools from the kit (`DevSignIn`, `devSignInAccount`, `devStubPlugin`, `devMarkersIn`); the header stays Bingo's (kit request R1: the kit's folds below a fixed 960 px).
  - The look gate: 48 screens (sign-in, leaderboard, account, Admin Overview, final placement; website leaderboard, account, open chat; 1280×720, 959×700, 390×844; light and dark) pixel for pixel the same after every piece.
- Master red after the merge of PR #57 (run 45041420629, webkit-mobile `playerFit`): fixed at its cause on `fix/playerfit-effects`, PR #59 (with a second flake found on PR #58: the admin settings pages remounted on StrictMode's late first answer, `useAdminLoad`). CI and CodeQL green; **not merged** (the night allows only part A's merge).

- A5: PR #57 merged as **`f6c2e1d`** (CI 45040634570 and CodeQL green on its last commit `546d708`); only master and the part B branch on origin. Master CI on `f6c2e1d` red in webkit-mobile (flake, see PR #59), CodeQL green.

### Running

- Part B: CI and CodeQL of B4–B6. The real-site rehearsal on B4 (nginx, `60ebca7`, website `de057d8`): **63 PASS / 0 FAIL** (the install with the recovery key, `sbr update` with its backup, the real website sign-in through the kit).

### Open

- Nothing of the night's list besides B7 (dropped).

### Reverted

- Nothing.

### Review screenshots

- `reports/screens/latest/kit-<piece>-<before|after>-<screen>-<size>-<light|dark>.jpg`, 96 pictures: b1 (final placement, Admin Overview, sign-in), b2 (website account, leaderboard), b3 (the open website chat), b4 (website account), b6 (leaderboard with "Dev sign-in"); at 1280×720, 959×700 and 390×844. "before" is the state before that piece's first screen change (standalone before B1, website account and leaderboard before B2, chat before B3); every pair is pixel for pixel the same.

### Dropped

- **B7, the docked layout (K18)**, under the rule to drop B7 first when time runs short: its first step needs a website-mode sweep of every match screen with axe at ten sizes, light and dark (a new extension of the fit audit and a new development dependency), and likely fit work where the chat strip narrows the board (1280×720, 1366×768); estimated 5–7 hours on this machine, too close to the end of the night with the final checks. What it needs: docs/concepts/kit-adoption.md §5 "B7".

### Decided (owner decisions of 2026-11-22, after the night)

- **PR #59 merged** as `c1bab70` (master's red `playerFit` and the admin pages' remount flake).
- **B5 not adopted for now**: Bingo keeps its final placement; kit request R4 (a `ResultFrame` that sits as a panel inside a screen) in docs/concepts/kit-adoption.md §4.
- **The website-mode top bar at 1280 px stays as it is for now** (covered by kit request R1).
- **The kit's v0.10.1 before the merge** (`f7bd65b`): its renames (`data-sk-` attributes) needed no change in Bingo; a shell test pins the toggle's `data-sk-theme-now` (failed on v0.10.0). Then PR #58 merged when green.
- The kit requests R1–R4: docs/concepts/kit-adoption.md §4. The operator guide notes the recovery codes after a rollback.

### Noticed, left alone

- In website mode at 1280 × 720 the bar folds into the menu for the website admin and for an organizer in production too: the back link "← Seasonal Entertainment" takes the room the development items take in development (the decision of 2026-11-22 measured standalone development builds). Players are not affected.

- The first nginx run (fresh) stopped once on the website's own image build (`npm ci` exit 146 after 244 s): Docker downloads inside containers on this PC are slow (46–63 s for a registry fetch against 0.6 s on the host); the website repository is read-only. A second fresh run got past it.
- `ops/lib/backup.sh` `drill_database` waits with the same socket `pg_isready` and then 2 s; it has worked so far and is left as it is.
- The merge commit `3754710` has git's default message without the co-author line (amending it was not allowed).
- After `sbr rollback` from a version with the recovery key, codes confirmed in between do not work with the old version until the next update (docs/concepts/kit-adoption.md §7).

# The admin area's night (2026-11-21/22)

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
  - Commit `c559d8f`; CI and CodeQL green (run 44868036339).
- Piece 3 — the Presets:
  - No migration: each preset is a settings document `preset:<id>` (§6) with name, game type, mode, status (draft, published, retired), when it was last published, and the full ruleset. At start the server seeds one published preset per built-in ruleset unless it exists (`apps/server/src/admin/presets.ts`); its id is the ruleset's name so far (`royale-realtime`, `royale-async`, `classic-seasons-realtime`, `classic-realtime`), which a new match freezes as its ruleset name as before — never the admin's preset name, since the website's open sign-ups filter on that name (`-test`).
  - Value forms generated from the schema: `presetFields(ruleset)` in @sbr/contracts (`config/presetFields.ts`, the texts in `config/presetCatalogue.ts`) lists each value with its tab, name, what changing it does, unit (milliseconds shown as seconds, minutes or hours), kind, the min and max read from `RulesetSchema` itself (zod's `minValue`/`maxValue`; shown as "technical limit") and a warning where needed; the server adds the current value and the built-in default. Values the game does not read (§8 (r)) and values the preset's mode does not read are left out.
  - New matches take the published preset (§8 (b)): a match created without a chosen ruleset (the host form, the API; not the fast test profile) plays the most recently published preset of its game type and mode and freezes that copy; running and older matches keep their own.
  - New endpoints (`apps/server/src/http/routes/adminPresets.ts`; checked on the server, zod-validated, rate-limited and CSRF-checked by the session plugin, every change a new version with its audit entry): `GET /api/v1/admin/presets` (`admin.view`), `POST /api/v1/admin/presets/:id { values, comment? }` (`settings.edit`; only paths the preset's fields offer; the result must pass the full `RulesetSchema`), `POST /api/v1/admin/presets/:id/duplicate { name, comment? }` (`settings.edit`; a draft), `POST /api/v1/admin/presets/:id/status { status, comment? }` (`settings.edit`; publish or retire; 409 `LAST_PUBLISHED` for the last published preset of a kind). Authz rows: allowed for Admin and owner; refused for signed out, guest, player, another host, the match's host; website mode allowed for the website admin only.
  - Undo now works value by value inside a document (a preset's other rules stay), and is refused (409 `UNDO_REFUSED`) when it would leave a preset invalid or no preset of its kind published.
  - Client: `#/admin/presets` (`admin/AdminPresets.tsx`, `PresetEditor.tsx`, `presetText.ts`): pick a preset; Publish or Retire; Duplicate under a new name; the rules in seven tabs (only tabs with values: a classic preset has no stages or jackpot), each value with its name ("Stage 2 · Rounds", "Spring · Points"), warning, input in the shown unit, what it does, "Built in: … · technical limit …"; a comment and "Save the rules", which sends only the changed values. The History names a preset change by value ("Battle royale · Time between numbers: 5 s → 7 s").
  - Tests that failed first: `packages/contracts/src/config/presetFields.test.ts` (no module; later the mode filter: 1 failed), `apps/server/test/adminPresets.integration.test.ts` with its routes unregistered (5 failed), `authzMatrix.integration` without the four rows (2 failed), `apps/web/src/admin/adminPresets.test.tsx` (no page). e2e `adminPresets.spec` (serial: the admin changes "Time between numbers", the host starts a match the old way with the interval left empty and it runs on the new interval, the History shows it; fit at 1280×720 and 390×844 at 100/125/150 %).
  - Reused: `SettingsStore` (new `seed`, `create`, `documents`), the audit chain, `requirePermission`, `defaultRulesetFor`, `DEFAULT_RULESETS`, `RulesetSchema`, `gameTypeName`, `problemText`, `AdminNav`, the panel/chip/field tokens; e2e `signIn`, `hostMatch`, `stopMatch`, `post`, `captureLook`, `fitProbe`.
  - Review shots: `admin-3-presets-*` (the rules panel with the changed value).
  - Commit `1fa124e`; CI and CodeQL green (run 44872429586).
- Piece 4 — "Start a match", the Organizer's three steps:
  - Each preset gets a part for the Organizer (`packages/contracts/src/config/organizer.ts`, `OrganizerSchema`): a line of what is special, the players range with the value the page starts at, three speeds (relaxed, normal, quick) and the starts allowed (now, at a time, when full). A preset stored before this has the defaults filled in on reading (`organizerDefaults`: today's host form — 2 to 200 players, 20 to start with, every start — and the ruleset's interval as "normal", one second faster as "quick" but never below the shortest interval, D12, half as slow again as "relaxed"; asynchronous a third and twice, in whole minutes). The Admin edits it in the Presets tab "For the organizer", generated from the schema like the rules; a speed is limited to its preset's mode (`speedRange`).
  - New endpoint `GET /api/v1/presets` (`match.create`; `apps/server/src/http/routes/startPresets.ts`): the published presets with only the Organizer's part, never their rules; live ones first. Authz rows: allowed for another host, the host, Admin and owner; refused for signed out, guest and player. Website mode: allowed for a member who may host and the website admin; refused for signed out, guest and member. `POST /api/v1/matches` takes `preset` and `speed`: the chosen published preset's rules, its id as the ruleset name, its speed as the interval; players outside its range, a start it does not allow, a draw interval, prizes, quiet hours or the fast test profile beside a preset, and a speed without a preset are refused (400); a retired or unknown preset is 409 `PRESET_UNAVAILABLE`. Without `preset` the API works as before (the Quick Test and the tests use it).
  - Client: `#/host/new` is "Start a match" (`host/StartMatch.tsx`, `StartSteps.tsx`, `ThisMatchFields.tsx`, `startForm.ts`) in place of `CreateMatch.tsx`: 1 game type tiles (a type without a published preset cannot be picked), 2 the presets of that type as tiles (one preset as a line), 3 title (prefilled "Battle royale — Sat 21 Nov"), start (only the allowed ones), players (a slider inside the range), speed in words with what it means, the website switch (website mode), "More choices" (between rounds, missed numbers, counts for the league; in development the fast test rules); the summary line and "Open the lobby". Removed with the old form: `CreateMatch.tsx`, `BasicsFields.tsx`, the asynchronous pace fields (`AsyncFields.tsx` became `asyncTiming.ts` with the time zone and the minutes check the console uses) and `createForm`'s pace; `createForm.ts` stays for the Quick Test.
  - Found and fixed while testing: in development React runs the page's first fetch twice, and the later answer reset what the Organizer had already chosen (hostNav e2e); the Presets page went back to its first tab after a save.
  - Tests that failed first: `packages/contracts/src/config/organizer.test.ts` (no module; the speed limit by mode), `apps/server/test/startPresets.integration.test.ts` with the route unregistered and the preset ignored (4 failed; live presets first: 1 failed), `authzMatrix.integration` without the route (4 failed), `apps/web/src/host/startMatch.test.tsx` (no page; strict mode: 1 failed), `apps/web/src/admin/adminPresets.test.tsx` "stays on the tab after a save" (1 failed). Ported from the old form's tests: the D16 automatic-start checkbox, the 15 s pause (D21) and its range, the title limit and countdown text, the asynchronous choice under the royale only. Dropped: the old form's D12 seconds message (the speeds are checked against D12 with the preset; the console's seconds field keeps its message). e2e: `startMatch.spec` (three steps, quick, the lobby on the quick interval, fit at 1280×720 and 390×844 at 100/125/150 %, the admin's tab); `realGame.ts` `hostMatch` now creates through the API with every choice spelled out, so the specs that need exact intervals or prizes keep them; `asyncMatch.spec` creates its asynchronous match through the API; hostNav, backToWebsite, websiteIdle and createFormPhone use the new page.
  - Reused: `StartRuleField` (now with the starts allowed), `RoundPauseField`, `MissedField`, `toStartRule`, `startTimeProblem`, `toRoundPause`, `toMissedNumbers`, `YourMatches`, `gameTypeName`, `GAME_TYPES`, `problemText`, `useLimits`, the field generator of piece 3 (`presetFields`, `readPath`, `writePath`), `requirePermission`; tests `serveWithLimits`, `show`.
  - Noticed: in one local run of the specs that use `hostMatch` (six specs in parallel, 10 minutes), `playerFit.spec` failed twice — a sign-in timed out, and the host console at 360×640 put Draw next at 670 px (limit 640). Alone it passed 4 of 4; the failing run's page snapshot was overwritten by the rerun, so the layout failure has no named cause yet. Watched in CI.
  - Review shots: `admin-4-start-*` (the page with "More choices" open), `admin-4-organizer-*` (the Presets tab "For the organizer").
  - Commit `cd600c4`: CI red in the docs job only (the markdown link check: docs/concepts/fit-audit.md linked a line of the removed `AsyncFields.tsx`); every browser job and CodeQL green, `playerFit` included. Fixed in `b577e73` (the link became plain text naming the removed file); CI and CodeQL green (run 44879130930).
- Piece 5 — the League:
  - The league values on the settings store: the `leaderboard` document (`packages/contracts/src/config/league.ts`: points for 1st, 2nd, 3rd, 4th–10th, 11th–25th — the bands stay fixed —, finalist bonus, finish bonus, fewest players for points, only confirmed players count; 0–1000 points and 2–200 players from admin-values.md). The server reads them when a match's points are awarded (`leagueConfigOf`; the match runtime's `league()` replaces the single e-mail flag), so a change applies to every match that finishes afterwards; points already given stay. A new season period stores the table in force.
  - Corrections: migration `0022_league_corrections.sql` — permission `league.correct` for game_admin and super_admin; `sbr.league_corrections` (player, season, delta never 0 and within ±10000, reason of 3–200 characters, the admin's id, when); a trigger refuses UPDATE and TRUNCATE, the app role may only INSERT and SELECT (a wrong correction is undone by one the other way); rows go with the player's account (the cascade still works with the rights revoked: tested). A correction adds its delta to the player's season and all-time entries in the same transaction as its audit entry (`apps/server/src/leaderboard/corrections.ts`). The public profile lists the corrections with their reasons; the data export includes them; the History names the player while the account exists ("a removed account" after; the audit log stores only the account id, never the name — it is never rewritten).
  - New endpoints (`apps/server/src/http/routes/adminLeague.ts`; server-side permission, zod, the session plugin's limit and CSRF, audited): `GET /api/v1/admin/league` (`admin.view`: the values as generated fields, the latest corrections), `POST /api/v1/admin/league { values, comment? }` (`settings.edit`; only the League's keys; the whole document must pass the schema), `POST /api/v1/admin/league/corrections { displayName, delta, reason }` (`league.correct`; 404 for an unknown player). Authz rows: allowed for Admin and owner; refused for signed out, guest, player, another host, the match's host; website mode allowed for the website admin only.
  - Client: `#/admin/league` (`admin/AdminLeague.tsx`, `LeagueCorrections.tsx`): the values (the value row of the Presets moved into `admin/ValueField.tsx` and is shared), a comment and Save; the corrections form (player, points, reason; Add only when all three are given and the points are not 0) and the latest corrections. The profile (`league/ProfilePage.tsx`) shows "League point corrections". The History names League values ("1st place: 100 → 150") and corrections. Flat settings documents get their fields from the schema with `settingsFields` (@sbr/contracts), for the sections still to come too.
  - Tests that failed first: `packages/contracts/src/config/league.test.ts` (no module), `apps/server/test/adminLeague.integration.test.ts` with its routes unregistered (6 failed: a match finished after the change is awarded 150 + 2 for 1st place; a correction moves the season and all-time points, shows on the profile and in the History; refusals; never changed; goes with the account), `dbRoles.integration` and `authzMatrix.integration` without the revoke and the routes (5 failed), `apps/web/src/admin/adminLeague.test.tsx` (no page). e2e `adminLeague.spec` (serial: the admin changes 1st place, corrects a player the spec registers, the League page and the profile show it, the History too; fit at 1280×720 and 390×844 at 100/125/150 %; the value put back and the account deleted with its correction).
  - Reused: `SettingsStore.change`, `appendAudit`, `periodsFor` (now returning the season and the all-time period and storing the table in force), `requirePermission`, the field generator's `kindOf`/`limitsOf`, `ValueField`, `when` (now shared from `changeText`), `problemText`; e2e `signIn`, `post`, `captureLook`, `fitProbe`.
  - Review shots: `admin-5-league-*` (the corrections with the new one), `admin-5-profile-*` (the profile with the correction).
  - Commit `a521c38`; CI and CodeQL green (run 44880684561).
- Piece 6 — "Screens and texts":
  - The `screens` settings document (`packages/contracts/src/config/screens.ts`, bounds from admin-values.md parts C and D): the player client's values — standings rows (20), final placement rows (20), recent-event lines (3), the final notice's numbers (3), a recap card's time (5 s), the lobby refresh (3 s), the maintenance check (30 s) — go out in the session answer as `screens` and the client reads them with `useScreens()` (`shell/session.tsx`; today's values until the session answers), so they apply at the players' next page load (§8 (i)). The server's list sizes — matches in the lobby (50), a leaderboard page (50) and the rows around a player (5), a profile's recent matches (10), the open sign-ups for the website (20) — are read on every request and apply at once.
  - A section's settings document that no migration made is created empty on its first change (`SettingsStore.change`), so new sections need no migration.
  - New endpoints: `GET /api/v1/admin/screens` (`admin.view`) and `POST /api/v1/admin/screens { values, comment? }` (`settings.edit`), through the new shared `registerFlatSettings` (`apps/server/src/http/routes/adminFlatSettings.ts`; only the document's own keys, the whole document must pass its schema, a new version with its audit entry), which the League's values now use too. Authz rows: allowed for Admin and owner; refused for signed out, guest, player, another host, the match's host; website mode allowed for the website admin only.
  - Client: `#/admin/screens` (`admin/AdminScreens.tsx`) with the League's values panel made shared (`admin/SettingsValues.tsx`); the admin pages are chosen in `admin/AdminArea.tsx` (AppShell stays under 300 lines; the router's sections in one list). The History names screen values ("Standings rows: 20 → 30").
  - Tests that failed first: `packages/contracts/src/config/screens.test.ts` (no module), `apps/server/test/adminScreens.integration.test.ts` with the route unregistered (4 failed; it then found the missing document — 500 — fixed by creating it on the first change), `authzMatrix.integration` without the routes (4 failed), `apps/web/src/admin/adminScreens.test.tsx` (no page). e2e `adminScreens.spec` (serial: "Standings rows" 5, a match with 10 players, after a reload the host's standings show 5; fit at 1280×720 and 390×844 at 100/125/150 %; the value put back and the match aborted).
  - Reused: `settingsFields`, `ValueField`, `SettingsValues`, `SettingsStore`, `requirePermission`, `useLimits`' pattern for `useScreens`, `problemText`; e2e `hostMatch`, `fillAndStart`, `stopMatch`, `post`, `captureLook`, `fitProbe`.
  - Review shots: `admin-6-screens-*`.
  - Commit `d3bb564`: CI red in one Chromium job — `playerFit` (host console at 360×640: Draw next at 690 px, limit 640), the failure first noticed locally in piece 4. Cause, from the CI trace: a season line ("Autumn harvest: +0 points for the marked cells in your row") wraps to two lines under the drawn numbers and pushes Draw next below the window; whether such a line shows depends on the season effects drawn, so it passed or failed by chance. Fixed at the cause in `cb726e6`: the console's rules line goes below the console on a phone, as on the player's screen (`.host-rules`), which gives the room back; CI and CodeQL green on it (run 44884314536).
- Piece 7 — Technical:
  - The `technical` settings document (`packages/contracts/src/config/technical.ts`, hard bounds from admin-values.md part C): player session idle (7 days) and at most (30), admin session idle (30 min) and at most (8 h), the reset link (60 min), the application rate limits per window (sign-in per account and address 5 and per address 20 in 15 min, registration 5 an hour, API 120 a minute, guest sessions 10 an hour, resets 10 per address and 3 per e-mail an hour, second-step codes 5 in 15 min; the windows stay), socket caps per address (50) and per session (5) with the environment as their first default (§8 (p)). Every value has a warning; the page has one at the top.
  - Read at runtime (`apps/server/src/config/technical.ts` `liveTechnical`): the rate limiters read their rule on every request (`RateLimiter` takes a function, `liveRule`), sessions are made and slid with the lengths of the moment (`createSession`, `findSession`, `refreshSession` take `SessionLengths`; the session plugin, the gateway and the host intents pass them; website mode keeps 7 days for members and guests), the socket caps are read on every connect, the reset link's lifetime and its e-mail text on every request.
  - Who: standalone, the owner only — migration `0023_technical.sql` gives `super_admin` `technical.edit`; website mode, the website admins (`settings.edit`, §8 (e)). A change in a standalone install needs the second step passed within the last 10 minutes, else 403 `STEP_UP_REQUIRED`; new `POST /api/v1/auth/2fa/step-up { code | recoveryCode }` passes it again for the session (a local admin with a confirmed factor; wrong answers 400, limited like the sign-in step). The session now knows when it last passed the second step (`secondStepAt`).
  - New endpoints: `GET`/`POST /api/v1/admin/technical` (through `registerFlatSettings` with a new `beforeSave` check), `POST /api/v1/auth/2fa/step-up`. Authz rows: Technical allowed for the owner only standalone (refused for signed out, guest, player, another host, the match's host and the Admin), for the website admin only in website mode; the step-up answers every session (409 for one without a second step, like the other 2FA routes) and refuses the signed out.
  - Development: "Sign in as owner" (`dev-owner`, super_admin; its sign-in counts the second step as just passed, like `dev-admin`).
  - Client: `#/admin/technical` (`admin/AdminTechnical.tsx`): the warning, the values (`SettingsValues`), and when the server asks, "Confirm it is you" with the code, then the same values saved again. The navigation shows Technical to the owner, and to website admins in website mode. The History names Technical values.
  - Tests that failed first: `apps/server/src/auth/rateLimit.test.ts` (a live rule; on the old limiter), `apps/server/test/adminTechnical.integration.test.ts` with the route unregistered (5 failed: owner only, a lower sign-in limit refuses the next try at once, a shorter player session makes the next guest session 3 days, limits, the second step after 10 minutes), `authzMatrix.integration` without the routes (4 failed), `apps/web/src/admin/adminTechnical.test.tsx` (no page). e2e `adminTechnical.spec` (serial: the Admin has no Technical link; the owner sets 6 sign-in tries, the server refuses within seven tries, the History shows 20 → 6; fit at 1280×720 and 390×844 at 100/125/150 %; the value put back).
  - Reused: `registerFlatSettings`, `SettingsValues`, `ValueField`, `verify` and `markSession` of the sign-in's second step, `RATE_RULES`' windows, `requirePermission`; e2e `signIn`, `post`, `captureLook`, `fitProbe`.
  - Review shots: `admin-7-technical-*`.
  - Commit `94954fd`; CI and CodeQL green (run 44886274097).
- Piece 8 — Players and accounts (standalone only):
  - Migration `0024_accounts_admin.sql`: `accounts.manage` for game_admin and super_admin, `admins.manage` for super_admin (only the owner makes and unmakes Admins, admin-area §2).
  - `apps/server/src/admin/accounts.ts`: find up to 20 accounts whose name or e-mail starts with the search (never deleted ones; roles, status, whether a second step is set up, last sign-in); each change in one transaction with its audit entry: give or remove Organizer or Admin (the Admin role ends the account's sessions — an existing player session would otherwise hold admin permissions without the second step, D60), lock (status suspended, sessions ended) or unlock, reset the second step (factor and recovery codes gone, sessions ended), end the sessions; the ended sessions' sockets close at once.
  - New endpoints (`apps/server/src/http/routes/adminAccounts.ts`, registered in standalone installs only): `GET /api/v1/admin/accounts?q=` (`accounts.manage`), `POST /api/v1/admin/accounts/:id/role { role, on }` (`accounts.manage`; the Admin role `admins.manage`), `…/:id/lock { locked }`, `…/:id/reset-2fa`, `…/:id/end-sessions` (`accounts.manage`). Every change needs the second step passed within the last 10 minutes (403 `STEP_UP_REQUIRED`, the Technical section's check), refuses one's own account (409 `OWN_ACCOUNT`), an owner's account for an Admin (403) and an unknown one (404). Authz rows: allowed for Admin and owner; refused for signed out, guest, player, another host, the match's host. Website mode: the routes do not exist.
  - Client: `#/admin/accounts` (`admin/AdminAccounts.tsx`, `AccountCard.tsx`): the search, each account's facts and its buttons (Make/Remove Organizer; Make/Remove Admin for the owner only; Lock/Unlock; Reset second step when there is one; End sessions); "Confirm it is you" (now shared, `admin/StepUp.tsx`) when the server asks; in website mode only the note. The navigation shows it to holders of `accounts.manage`. The History names each account change ("managed1 made an Organizer", "managed1 locked").
  - Tests that failed first: `apps/server/test/adminAccounts.integration.test.ts` with the routes unregistered (5 failed: find; Organizer at once, Admin by the owner only and its sessions ended; lock refuses the sign-in, unlock lets it in, audited; end sessions, reset the second step; own account, owner, unknown, stale second step refused), `authzMatrix.integration` without the routes (3 failed), `apps/web/src/admin/adminAccounts.test.tsx` (no page; the History lines: 1 failed). e2e `adminAccounts.spec` (the Admin finds a registered account, makes it an Organizer, locks it — its sign-in refused —, unlocks it; fit at 1280×720 and 390×844 at 100/125/150 %; the account deleted at the end, unlocked first if a step failed).
  - Reused: `recentSecondStep` (piece 7), `appendAudit`, `requirePermission`, `sessionEnds`, `StepUp`, `when`; e2e `signIn`, `post`, `captureLook`, `fitProbe`. Noticed, left alone: `resetTwoFactor` of `sbr admin reset-2fa` (by name, without an audit entry) deletes the same rows as the new `resetSecondStep` (by id, audited); the CLI could use the new one.
  - Review shots: `admin-8-accounts-*`.
  - Commit `d2a061c`; CI and CodeQL green (run 44888741091).
- The night's one full-length realtime royale (CLAUDE.md, a task that changes rules and screens): the acceptance play-through `royale-timed` (host and three players, bots to 20, real rules from the published preset, draw mode switched mid-match) passed in 7.6 minutes. A first attempt failed in its teardown only, because the dev server it shares (3900/5390) was restarted under it; nothing in the game failed.
- At the end: the dev server runs this branch (standalone, 3900/5390, migrations 0020–0024 applied); `reports/screens/latest/` holds only the review set (`admin-m1-*`, `admin-1-*` … `admin-8-*`, 51 pictures). On this machine's databases the built-in presets carry the names of the first seed (e.g. "royale-realtime"); fresh installs show "Battle royale".

## Running

- Nothing. PR #56 is open and not merged.

## Open

- Nothing of admin-area.md §9: pieces -1 to 8 are built.

## Reverted

- Nothing.

## Decided (owner decision of 2026-11-21)

- A match without a preset: only Admins, the load check and development tools (development builds) create one; an organizer names a published preset (admin-area §8 (s)). Built: the server refuses an organizer's request without a preset (403 `PRESET_REQUIRED`); the development tools mark their requests (`devTools: true`, refused outside development builds); the test helpers and the Quick Test send the mark.

- Players and accounts: every Admin locks and unlocks; only the owner resets a second step and sees e-mail addresses (admin-area §8 (t)). Built: migration `0025_accounts_owner.sql` (`twofactor.reset`, `accounts.email` for super_admin); the 2FA reset route needs `twofactor.reset`; the search returns e-mail addresses and finds by them only with `accounts.email` (finding by e-mail would reveal an address); the page hides the reset button and the e-mail search from an Admin. Authz rows: reset-2fa now the owner's only; in website mode every account route answers every role with 404 or a refusal (new rows).

- Kept as built (admin-area §8 (u)–(aa)): an Admin's abort reads "cancelled by the system"; the audit log stores no IP address (docs/spec/04 aligned); presets change values only, asynchronous quiet hours come from the preset, the built-in speeds stay; "Start a match" has no estimated length, stage line or fixed button; league changes apply to matches that finish afterwards, season length and names stay out; the values not yet in the admin area stay as they are (one item in docs/BACKLOG.md Part one); settings stay in memory per process (the one-process note in docs/operator-guide.md §9).

## Small faults fixed on 2026-11-21

- The account chip names the highest role — owner, admin, organizer or player — instead of "host" for everyone who may start a match (`highestRole`, `apps/web/src/shell/session.tsx`); the e2e sign-in reads it per identity.
- Built-in presets still named by their key on an existing database ("royale-realtime") get the names of a new install ("Battle royale", …) through migration `0026_preset_names.sql`: a new version, only while the name still equals the key, never for a preset an admin renamed; idempotent. The leftover `classicSeasons-realtime` preset of an early build on this machine is not a built-in key and keeps its name.
- The top bar never takes two rows: it folds its items into the menu button whenever they do not fit on one row (`apps/web/src/shell/useBarFold.ts`, measured before the browser paints; always below 960 px), not only below a fixed 960 px. Checked at 960, 1024, 1100, 1280 and 1366 px, light and dark (`e2e/topBar.spec.ts`, which failed first at 960 px). With the longer chip ("(organizer)") an organizer's bar folds at 1280 px too; specs that click the bar open the menu first (`openMenu`).
- Units read in the singular for one ("1 day", "1 try", "+1 point"): `unitFor` (`apps/web/src/game/labels.ts`) in the admin area's values, limits, History lines and league corrections.

## Commits and CI of 2026-11-21/22

- `3b6c691` an organizer names a preset; the chip's role; singular units. `15b058f` only the owner resets a second step and sees e-mail addresses. `92b2717` migration 0026, preset names. `f60ba87` the top bar folds whenever its items do not fit; `1bb5cdd` its lint fix. `20a495b` the decisions that keep what was built. CI on `20a495b` red (run 44954897064): two website-mode specs created matches without a preset (403) — fixed in `33a1458` (the specs mark their matches as a development tool; backToWebsite waits for the chip to be attached, as the bar may fold); CI on `33a1458` red in Firefox only (run 44959191596): `leaderboard.spec` waited a fixed 180 s while its classic match's first row came with number 44 — fixed at the cause in `bab7ed3` (the wait covers all 75 numbers); CI and CodeQL green (run 44960459929). `cd86ffa` this sheet; CI on it red in Chromium (run 44961351486): `account.spec` clicked the menu button just as the bar, resized back to desktop width, unfolded and the button went away — fixed at the cause in `f8a9ce0` (`e2e/menu.ts` openMenu lets a pending fold decision land, two animation frames, before it looks at the button); CI (run 44962677738) and CodeQL (run 44962677723) green.
- Play-checked in the browser (dev server): the organizer starts a match from a preset; a crafted request without one answers 403 `PRESET_REQUIRED`; the Admin locks and unlocks an account and sees no e-mail address and no "Reset second step"; the owner sees the address, finds by it and is offered "Make Admin" ("Reset second step" shows only for an account with a second step, none of the development accounts has one: covered by `apps/web/src/admin/adminAccounts.test.tsx`); the top bar at 960, 1024, 1100, 1280 and 1366 px. Review shots in `reports/screens/latest/`: `admin-fix-topbar-*`, `admin-fix-accounts-admin-*`, `admin-fix-accounts-owner-*`, `admin-fix-organizer-console-*`.

## Needs the owner's word

- **Decided (owner decision of 2026-11-22): kept as built, PR #56 merged as it is; nothing is moved.** Top bar at 1280 px (finding of 2026-11-22): the fold there comes from the development-only items, not from the account chip. Measured in Chromium on the dev server: at 1280 px the bar has about 1216 px for its items; the development build adds "Quick Test" (112 px) and "Dev sign-in" (125 px), which puts the organizer's bar about 6 px and the owner's and Admin's about 80 px over. With those two items hidden, every role's bar fits unfolded at 1280 px (owner and Admin fold from about 1100 px, the organizer at 1024 px, a player not at all). A shorter chip (name and role badge) saves some 20 to 30 px: the organizer's development bar would fit, the owner's and Admin's would not. Fitting all roles in development means moving the development items (for example Quick Test into the "Dev sign-in" menu), which is beyond the chip; production builds need no change.
- Undo reverts only the values the undone change touched (a new version); the concept's wording ("a new version whose content is an older version's") would also undo every later change to other values of the same document. When nothing changed after it, both are the same.
- The e-mail switch is shown in both modes; in website mode the website decides who is confirmed, so it changes nothing there but is harmless. Hide it in website mode?
- Presets: a match created through the API without a preset takes the most recently published preset of its kind when several are published (the Organizer's page always names one).
- Presets: a preset's name cannot be changed after Duplicate (no rename in §9 piece 3); built-in presets still named by their key get the names of a new install from migration 0026. On this machine's local test database an earlier build of this piece also seeded a `classicSeasons-realtime` preset with the same rules as `classic-seasons-realtime`; left as it is (an admin can retire it on the Presets page). Fresh installs and CI get "Battle royale" etc.
- Presets: `stages.*.cut.value` has no schema maximum (it is a share, a number of players or a score, by the cut's kind); the form shows no technical limit for it.
- Start a match: the fast test rules (development only) stay on the page under "More choices" for a live royale preset; with them the match uses the fast profile, not the preset.
- League: a correction goes into the current season and the all-time board; there is no choice of an older season.
- Technical: website mode keeps members' and guests' sessions at 7 days at most (owner 2026-11-04/09); the section's "Player session, at most" applies to standalone installs only.
