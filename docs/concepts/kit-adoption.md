# Adopting @seasonal/kit (v0.11.1)

Status: written 2026-11-22 on branch `feat/kit-adoption` (night chain part B, piece B0), before any code moves. Each piece B1–B7 updates its row when it lands.

How Bingo takes the shared kit (github.com/weudlll-cyber/seasonal-kit, now tag `v0.10.1`, §1; planned on `v0.10.0`, commit
`36a72cf`). The kit's own plan for Bingo (its docs/ADOPTION.md §"Seasonal Bingo Royale") was
written against Bingo `a43209a` (2026-11-21); this page re-checks it against Bingo master
`a1495bf` (2026-11-22: the admin area, migrations 0020–0026, the top bar that folds only when
its items do not fit, the fit fixes). The kit is read-only from here: what it lacks is a request
in §4, not a fork in Bingo.

## 1. The pin

`apps/web` (a dependency) and `apps/server` (a development dependency: `apps/server/build.mjs`
compiles the kit into the server bundle, so the image's `pnpm deploy --prod` needs no `git`; CI
run 45038443991 had failed with `ERR_PNPM_GIT_RESOLVE_FAILED` before) depend on
`"@seasonal/kit": "github:weudlll-cyber/seasonal-kit#v0.10.1"` (the kit's docs/DELIVERY.md): the
tag's committed `dist/` and CSS, no build and no install script; the lockfile resolves the tag to
commit `76bd872`. React 19.3.1 and Vite 8.3.4 (the kit's peers) are Bingo's own. The pieces
B0–B6 were built on v0.10.0 (`36a72cf`); the move to v0.10.1 came before the merge (owner
decision of 2026-11-22).

**v0.10.1's renames** (its CHANGELOG [0.10.1]: every kit data attribute is `data-sk-` prefixed,
e.g. `data-sk-theme-now`, `data-sk-view`, `data-sk-open`, `data-sk-layout`, `data-sk-fit-fixed`)
needed no change in Bingo: Bingo reads and writes none of the renamed attributes, and it loads
none of the kit files whose CSS changed (`bar.css`, `dock.css`, `frames.css`, `header.css`). The
same names in Bingo are its own: `data-season` (`apps/web/src/components/OwnerCard.tsx:177`,
`SeasonIcon.tsx:38`), `data-open` and `data-folded` of its own menu fold
(`apps/web/src/shell/MenuFold.tsx:78`, `menu.css:49`). Bingo uses no `useDisclosure` (the kit's
header and menu are not adopted), so `dismiss` is not used. A test pins the one renamed attribute
Bingo shows: the bar's theme toggle names the shown theme in `data-sk-theme-now`
(`apps/web/src/shell/shell.test.tsx`; failed on v0.10.0).

## 2. Per export: what it replaces, what stays, whether it fits

| Piece | Kit export                                                        | Replaces in Bingo (master `a1495bf`)                                                                                                                                                                                                                                                                                                                                                  | Stays in Bingo                                                                                                                              | Fits as is                                                                                                                              |
| ----- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| B1    | `tokens.css`                                                      | the shared tokens of `packages/ui/src/tokens.css` (142 lines: light 17–106 without 62–69 and 95–99, dark 108–142)                                                                                                                                                                                                                                                                     | the arena tokens (`--color-bingo-card*`, `--color-ball*`, 62–69) and its own `--gutter` / `--panel-padding` (95–99), loaded after the kit's | **done (B1)**: yes: value for value equal                                                                                               |
| B1    | `fonts.css`                                                       | `packages/ui/src/fonts.css` (26) and `assets/fonts/`                                                                                                                                                                                                                                                                                                                                  | —                                                                                                                                           | **done (B1)**: yes: the kit has five faces, Bingo uses book (400) and bold (700), the same files                                        |
| B1    | `motion.css`                                                      | `sbr-glow` / `.sbr-anim-win` (73–81, 103–105) and the reduced-motion rule (107–114) of `packages/ui/src/motion.css` (114)                                                                                                                                                                                                                                                             | `sbr-anim-draw`, `-fade`, `-mark`, the ball keyframes; `apps/web/src/motion.css`                                                            | **done (B1)**: yes; `.sbr-anim-win` has no use in `apps/web/src` (noticed)                                                              |
| B1    | `browser/theme-init.js`, `themeInit()` (`./vite`), `resolveTheme` | `apps/web/public/theme-init.js` (28), `index.html:18`; `resolveTheme` of `apps/web/src/shell/theme.ts` (43–45)                                                                                                                                                                                                                                                                        | —                                                                                                                                           | **done (B1)**: yes: the same script and key `se.theme`                                                                                  |
| B2    | `ThemeToggle` (`./react`)                                         | `apps/web/src/shell/ThemeToggle.tsx` (52; its `useTheme` is the kit's since B1), `.theme-toggle` in `shell.css` (123–140) and `menu.css` (36–38)                                                                                                                                                                                                                                      | the bar's layout                                                                                                                            | **done (B2)**: the same button, class `sk-theme-toggle`; Bingo keeps its `order` in the bar                                             |
| B2    | `BackLink`, `shell.css`                                           | `.shell-back` in `AppShell.tsx` (77–83) and `shell.css` (64–78, 199–202)                                                                                                                                                                                                                                                                                                              | its place in the bar (`order`, `shell/header.css`)                                                                                          | **done with v0.11.1 (§8)**: the kit's link inside its header; `shell.css` is loaded (before `base.css`, so Bingo's focus ring stays)    |
| —     | `websiteSignInHref`, `signInAgain`                                | `websiteSignInHref` and `useWebsiteResign` of `apps/web/src/account/WebsiteSignIn.tsx` (28–58)                                                                                                                                                                                                                                                                                        | `useSignInToPlay`, `SignInLinks`, `SignInPage`                                                                                              | not in the night's B list; with B4 or later                                                                                             |
| B3    | `WebsiteChatFrame`, `chatEmbedUrl`                                | the frame of `apps/web/src/shell/ChatDock.tsx` (162, src 136–137, `useDocumentTheme` 50–66)                                                                                                                                                                                                                                                                                           | the side panel and drawer, `chat.css` (101), until B7                                                                                       | **done (B3)**: yes, stricter: sandbox (K17), `strict-origin`, a relative src                                                            |
| B4    | `@seasonal/kit/server`                                            | `identityFrom`, `trustedPeers`, `mappedRoles` of `auth/websiteIdentity.ts` (125); `safeNext`, `proxySecret` of `http/routes/websiteSignIn.ts` (58–69); `auth/totp.ts` (73); `hashOf` and the code draw of `auth/twoFactor.ts` (29–30, 92); the class of `auth/rateLimit.ts` (34–78); `auth/sessionEnds.ts` (28); `parseSteps` of `packages/contracts/src/http/steps.ts` on the server | the routes; `RATE_RULES`, `openRouteLimit`, `liveRule`; `steps: 'all'`; `'hex'` codes, a recovery key (K20)                                 | **done (B4)**, the rate limiter with v0.11.1 (§8): the recovery key is a new server secret: the install and `sbr update` must create it |
| B5    | `ResultFrame`                                                     | the frame of `components/FinalPlacement.tsx` (48–57, 85)                                                                                                                                                                                                                                                                                                                              | **all of it** (`FinalPlacement.tsx`, `Podium.tsx`, `podium.css`, the rank rows)                                                             | **done with v0.11.1 (§8)**: `panel={{ level: 3 }}`                                                                                      |
| B6    | `AppHeader`, `header.css`                                         | the bar of `AppShell.tsx` (76–190), `MenuFold.tsx` (90), `useBarFold.ts` (75), `menu.css` (72), the bar's rules of `shell.css`                                                                                                                                                                                                                                                        | its links, account, tools and look (`shell/Header.tsx`, `shell/header.css`)                                                                 | **done with v0.11.1 (§8)**: Bingo's look and its fold below 960 px in `shell/header.css`                                                |
| B6    | `DevSignIn` (`./react/dev`), `@seasonal/kit/devtools`             | `DevSignIn` of `apps/web/src/shell/DevTools.tsx` (55–96); the account check of `routes/devSignIn.ts` (49–56); `apps/server/devStub.mjs` + its plugin in `build.mjs` (44–49); the scan of `productionBundle.test.ts` (22–31)                                                                                                                                                           | the route, the dev accounts, Quick Test                                                                                                     | **done (B6)**: the menu's look kept with Bingo's styles on the kit's classes                                                            |
| B7    | `DockedScreen`, `ChatDock`, `StartCard`, `GameBar`, focus mode    | the side panel and drawer of `ChatDock.tsx`, `chat.css`                                                                                                                                                                                                                                                                                                                               | the board, the balls, the claim                                                                                                             | after the sweep (K18)                                                                                                                   |

## 3. Since `a43209a`

- The admin area (`#/admin/*`, `admin.view` …, migrations 0020–0025) and preset names (0026):
  nothing of it is in the kit; the bar's Admin and Host items are game links.
- The top bar folds only when its items do not fit (`useBarFold.ts`), not below a fixed 960 px.
- The account chip names the highest role; the 1440 px "Signed in as" rule is the kit's too.
- Line counts moved: `AppShell.tsx` 280 → 290, `MenuFold.tsx` 86 → 90, `devSignIn.ts` 78 → 94,
  `DevTools.tsx` 92 → 96, `rateLimit.ts` 95 → 114, `websiteSignIn.ts` 118 → 128,
  `FinalPlacement.tsx` 131 → 134.

## 4. Requests for the kit

- **R1, the header folds when its items do not fit.** What: `AppHeader` folds its links and
  account into the Menu whenever they do not fit on one row (measured before paint), and always
  below 960 px. Why: Bingo's bar holds more for an owner, Admin or organizer (Host a match,
  Admin, the role chip) and in website mode the back link; a fixed 960 px gives two rows at
  1024–1366 px (owner decision of 2026-11-21, "the top bar never takes two rows"). Where: Bingo
  `apps/web/src/shell/useBarFold.ts` 33–75, `MenuFold.tsx` 32; kit `src/react/AppHeader.tsx` (146 lines),
  `css/header.css` 200–201 (`@media (max-width: 959px)`). **Answered in v0.11.0 (measured, no fixed width) and adopted with v0.11.1 (§8);** Bingo keeps its fold below 960 px in its own CSS.

- **R2, the back link keeps the space after the arrow.** What: `BackLink` renders "←Seasonal
  Entertainment": `.sk-back-link` is `display: inline-flex`, which drops the leading space of the
  text after the arrow's `<span>`, so the words move left and touch the arrow. Bingo's link
  (plain inline text) shows "← Seasonal Entertainment". Why: a visible change not covered by a K
  decision (K29 decided the 44 px target only); seen in the look gate at 1280×720 in website
  mode. Where: kit `src/react/BackLink.tsx` 25 (the `<span aria-hidden>` and the text) and
  `css/shell.css` (`.sk-back-link`, `display: inline-flex`); Bingo
  `apps/web/src/shell/AppShell.tsx` (the `.shell-back` link), `apps/web/src/shell/shell.css`
  (`.shell-back`). **Answered in v0.11.0 (a `gap` of 0.35em) and adopted with v0.11.1 (§8).**

- **R3, a rate rule read on every request.** What: `RateLimiter` takes a rule object fixed when it
  is made; Bingo's takes a rule or a function that is read on every request. Why: the admin
  area's Technical section changes the sign-in, registration, API, guest, reset and second-step
  limits at runtime (admin-area §9 piece 7, "applies at once"); a fixed rule would need a new
  limiter, and its buckets, at every change. Where: Bingo `apps/server/src/auth/rateLimit.ts`
  (the `rules: RateRule | (() => RateRule)` constructor and `liveRule`), used by
  `routes/twoFactor.ts`, `routes/adminTechnical.ts` and the other routes listed in §2; kit
  `src/server/rateLimit.ts` (the constructor and `validRule`). **Answered in v0.11.0
  (`RateRuleSource`) and adopted with v0.11.1 (§8):** the class is gone from
  `apps/server/src/auth/rateLimit.ts` (114 → 59 lines), which keeps `RATE_RULES`,
  `openRouteLimit` and `liveRule`; the six places that make limiters take the kit's.

- **R4, a `ResultFrame` that sits as a panel inside a screen.** What: a variant (or option) of
  `ResultFrame` without its own page: no `h1` and no one-screen first part, a section heading of
  the game's level, and names that never break inside their step (no `overflow-wrap: anywhere`).
  Why: Bingo's final placement is a panel inside the replay, the arena's notice and the host
  console (owner decision of 2026-11-22: B5 not adopted for now). Where: Bingo
  `apps/web/src/components/FinalPlacement.tsx` 48–85 (the example), `components/podium.css`,
  `apps/web/src/minTextSize.test.ts` (the podium rule); kit `src/react/ResultFrame.tsx`,
  `css/frames.css` 130–160. **Answered in v0.11.0 (`panel`) and adopted with v0.11.1 (§8).**

## 5. Done

- **B1** (tokens, fonts, motion, theme): `main.tsx` loads the kit's `fonts.css`, `tokens.css` and `motion.css` before the game's own files; `packages/ui/src/tokens.css` keeps only the arena tokens, `--gutter` and `--panel-padding` (142 → 32 lines); `packages/ui/src/fonts.css` and `assets/fonts/` (the same five files as the kit's, sha256 equal) are gone; `motion.css` lost the unused win glow and the reduced-motion rule (114 → 92); `apps/web/public/theme-init.js` and `shell/theme.ts` are gone, the kit's Vite plugin `themeInit` serves and emits `theme-init.js`, the toggle uses the kit's `useTheme`. The look: 30 screens (sign-in, leaderboard, account, Admin Overview, final placement; 1280×720, 959×700, 390×844; light and dark) pixel for pixel the same before and after.

- **B2** (toggle and back link): the bar's toggle is the kit's `ThemeToggle` (the same button and icons, class `sk-theme-toggle`); `apps/web/src/shell/ThemeToggle.tsx` (52) and its test `theme.test.tsx` (the behaviour is the kit's and tested there) are gone, and with them `.theme-toggle` in `shell.css`. `@seasonal/kit/shell.css` is loaded before `base.css`, so Bingo's 3 px accent focus ring stays on the toggle like on every other control (the kit's ring comes with the header, K29, B6). The back link stays Bingo's (R2). The look: the 30 standalone screens and 12 in website mode (leaderboard signed out, account signed in; three sizes, light and dark) pixel for pixel the same.
- **B3** (the chat frame): the panel's frame is the kit's `WebsiteChatFrame` (class `chat-panel__frame` kept): sandboxed (`allow-scripts allow-same-origin allow-forms allow-popups`, K17), `referrerpolicy="strict-origin"`, a relative address on the site's origin, the theme from `<html data-theme>`; `useDocumentTheme` and the absolute address are gone from `ChatDock.tsx` (166 → 148 lines). The side panel and the phone drawer stay Bingo's until B7. Tests that failed first: `chatDock.test.tsx` (the address, the sandbox, the referrer) and `e2e/chatEmbed.spec.ts` (the same, and the frame loads from the site's origin). The look: 48 screens, the open chat panel included, pixel for pixel the same.
- **B4, step 1** (the website sign-in): `GET <base>auth/website` uses the kit's `websiteSignInCheck` (this install's header names, `steps: 'all'`), `safeNext` and `websiteLoginLocation`; `apps/server/src/auth/websiteIdentity.ts` (125) is gone, `websiteAccounts.ts` takes `mappedRoles` from the kit, the contracts keep only the `Step` shape (`steps.ts` 76 → 20; `parseSteps` and its test went with the server's use). Stricter, as the plan said: the website's id is a positive integer, one role per member (a list or an unknown role signs nobody in), the name decoded as UTF-8, the steps list exactly as the contract (icons `/media/step-icons/<32 hex>.webp`), a guest header that is not exactly "false" is a guest, the return path refuses dot segments and encoded separators. The tests and the e2e stand-in send the contract's numeric ids and one role. The server bundle compiles the kit in (`apps/server/build.mjs`), so the kit is a development dependency of the server and the image needs no `git`.
- **B4, step 2** (the second sign-in step): TOTP from the kit (`matchingStep`, `newSecret`, `otpauthUri`; it refuses secrets under 16 bytes and odd clock values); `apps/server/src/auth/totp.ts` (73) and its test are gone. Recovery codes are the kit's `'hex'` codes, stored as `recoveryHash` under a new install secret `SBR_RECOVERY_KEY` (K20; 64 hex, never the seed key that seals the TOTP secrets); a typed code is looked up by both hashes in one statement (`code_hash = ANY($2)`, `recoveryLookups`), so codes stored as plain SHA-256 before keep working until used (K27). The key: made by the install with the other secrets, made once by `sbr update` for an install made before it, carried in every backup (`recovery.key`) and taken from the backup by a restore; development and the tests use a fixed key, production refuses to start without one. Tests that failed first: `twoFactor.integration.test.ts` "stores the recovery codes keyed" (the old code stored the plain SHA-256); new: a code stored the old way works once; `env.test.ts` reads the key.
- **B4, step 3** (session ends; the rate limiter kept): the server's `SessionEnds` is the kit's (`apps/server/src/auth/sessionEnds.ts`, 28 lines, is gone): every listener is called, a failing one goes to the log instead of an unhandled error, and the seven places that end sessions wait for it. The rate limiter stays Bingo's (§4 R3). The test harness gives its production builds a recovery key of their own.
- **B6** (the header and the dev tools): the header stays Bingo's (§4 R1: the kit's folds below a fixed 960 px; Bingo's bar folds whenever its items do not fit, the decision of 2026-11-21). The dev tools are the kit's: the client's "Dev sign-in" menu is `DevSignIn` (`@seasonal/kit/react/dev`, loaded only in development) with Bingo's identities and sign-in call, styled by Bingo's own rules on the kit's classes (`shell.css` `.sk-dev-menu*`, so the kit's `header.css` is not needed); the server's dev sign-in checks the request with `devSignInAccount` (own keys only, the whole load name); `build.mjs` swaps the dev modules with `devStubPlugin`; `productionBundle.test.ts` scans with `devMarkersIn` and the kit's markers too (`DevTools.tsx` 96 → 67, `devSignIn.ts` 94 → 81). The scan failed with a deliberate leak (a static import of the dev menu; reverted) and passes. The look: 48 screens the same.
- **B7** (the docked layout, K18): **dropped for this night**, under the task's rule to drop B7 first when time runs short. What it needs before its first step lands: a sweep of every match screen in website mode (the chat is there only), at 1280×720, 1366×768, 1536×768, 1440×900, 1900×860, 1920×1080, 375×667, 360×780, 390×844 and 430×932, light and dark, fitting and passing axe, as an extension of `e2e/acceptance/fitAudit.spec.ts` (which measures standalone screens today; axe would be a new development dependency, `@axe-core/playwright`). The kit's `DockedScreen` puts the chat strip beside the board, so the 1280×720 and 1366×768 boards will likely need fit work. The sweep exists since 2026-11-23 (branch `test/sweep`, `@axe-core/playwright` added): its baseline is docs/concepts/fit-audit.md §7. Then step 1 replaces `ChatButton`, `ChatPanel` and `chat.css` (`apps/web/src/shell/ChatDock.tsx`) with `DockedScreen` around the lobby, the match and the console.

## 6. Decided by the owner (2026-11-22)

- **B5 is not adopted for now: Bingo keeps its final placement** (request R4; adopted with
  v0.11.1, §8). The finding: the kit's frame is a result page of its own: its headline an `h1`, its first part one screen high under the bar (`.sk-result-first`, `height: calc(100dvh - var(--sk-result-top))` for a board game) with the reveal and the placings, and `overflow-wrap: anywhere` on the whole result (kit `css/frames.css` 130–160, `src/react/ResultFrame.tsx`). Bingo's final placement is a panel inside the replay, the arena's notice and the host console (`apps/web/src/components/FinalPlacement.tsx` 48–85, an `h3` "Final placement"), and its podium names never break inside their step (the fit rule of `minTextSize.test.ts`). Wrapping it would change what a player sees, and no K decision covers that.

- **The website-mode top bar at 1280 px stays as it is for now** (it folds for the website admin
  and for organizers, the back link taking the room): covered by request R1. Settled on
  2026-11-23: see §6a.

## 6a. Decided by the owner (2026-11-23)

- **The organizer's bar in website mode at 1280 px may fit on one row** instead of folding behind
  Menu. The kit's header (v0.11.1, adopted in §8) measures what fits, so it no longer folds for
  the back link's room; below 960 px Bingo's bar still folds whatever fits (`shell/header.css`).
- **On phones the back link keeps its short row; the kit's 44 px target (K29) stays waived for
  that link** (`min-height: 0` up to 640 px in `shell/header.css`), as Bingo's own link was.
  Without it the phone bar is 23 px taller and the player's card leaves a 375×667 window in
  website mode (the fit audit's sweep, docs/concepts/fit-audit.md §7). For the kit planning: a
  back link with a shorter phone row.

## 7. Noticed, left alone

- `sbr rollback` after an update that made the recovery key brings back an app that verifies only plain SHA-256 codes: recovery codes confirmed in between would not work there until the next update (TOTP codes work). Left as it is: a rollback is for a failed update, and the owner resets a second step with `sbr admin reset-2fa`.

- `.sbr-anim-win` and its `sbr-glow` keyframes in `packages/ui/src/motion.css` (73–81, 103–105) have no use in `apps/web/src`; B1 removes them with the shared part (the kit's `motion.css` brings `sk-anim-win`).

## 8. v0.11.1: the requests answered (branch `feat/kit-0.11`)

The pin moves from `#v0.10.1` to `#v0.11.1` in `apps/web` and `apps/server` (v0.11.1 needs
nothing beyond the pin; v0.11.0 answered R1–R4 and added `openRoundsPage`). Each part below
landed in its own commit; the look before and after is compared at 1280×720 and 390×844 (and the
header at 800 px), light and dark.

- **R3, the rate limiter:** Bingo's `RateLimiter` class (`auth/rateLimit.ts` 34–76) is gone;
  `sessionPlugin.ts`, `routes/auth.ts`, `routes/adminTechnical.ts`, `routes/passwordReset.ts`,
  `routes/twoFactor.ts` and `realtime/intents.ts` make the kit's. `liveRule` passes a function
  rule (`RateRuleSource`), which the kit reads on every `take`, so a limit changed in the
  Technical section applies at once. New with the kit: a rule changed in place cannot lift the
  limit, a broken read keeps the last valid rule, and at most 100 000 keys are held. The
  bucket tests moved with the class (the kit's `src/server/rateRule.test.ts`); Bingo's
  `rateLimit.test.ts` tests `liveRule` on the kit's limiter.

- **The open rounds:** `apps/server/src/http/routes/openRounds.ts` (89 → 108 lines) keeps its
  query, the "Show on the Seasonal Entertainment website" switch and the limit setting, and
  answers with the kit's `openRoundsPage` and `OPEN_ROUNDS_CACHE_CONTROL`: the website's checks
  applied before a round leaves the game (a title cut to 80 never through an emoji, UTC times,
  an https join URL on the game's origin, no closed sign-up), a round left out logged with its
  id. The kit keeps at most 20 rounds. The setting "Open sign-ups for the website" allowed 1–100
  at first, so 21–100 answered as 20; by the owner's decision of 2026-11-23 it allows 1–20 (default
  20), the range ending at the contract's cap (`MAX_OPEN_ROUNDS`,
  `packages/contracts/src/http/openRounds.ts:19`; the setting `screens.ts:39`), and its
  description says the website shows at most 20.

- **R4, the final placement:** `apps/web/src/components/FinalPlacement.tsx` (134 → 167 lines,
  the ranked rows now their own `RankRows`) builds the kit's `ResultFrame` with
  `panel={{ level: 3 }}`: the heading "Final placement", the own place and the rule as `lines`,
  `Podium.tsx` and `podium.css` as `placings`, the ranked rows as `more`, no reveal. Bingo does
  not load the kit's `frames.css` (its panel is two cards, the placings beside an empty reveal
  from 900 px), so `components/results.css` lays the frame out as Bingo's one panel. The test
  id is the kit's `result` (was `final-placement`) in the unit and e2e tests.

- **R1 and R2, the header and the back link:** `apps/web/src/shell/Header.tsx` (new, 135 lines)
  builds the kit's `AppHeader` with Bingo's links (Play, Host a match, Leaderboard, Admin), the
  Quick Test link and the chat button as `navExtra`, the account (the chip names the highest
  role), "Sign in" / "Register" (in website mode one "Sign in" to the website), the dev sign-in
  menu as `devTools`, a close key of route, chat and account, and `buttonClassName="sbr-btn"`;
  in website mode the kit's `BackLink` comes with it. Gone: `MenuFold.tsx` (90), `useBarFold.ts`
  (75), `menu.css` (72), `menuFold.test.tsx` (the kit tests its fold and menu), the bar's rules
  of `shell.css` (265 → 70), `Nav` and `Account` of `AppShell.tsx` (293 → 163), `SignInLinks` of
  `account/WebsiteSignIn.tsx` (114 → 88). `apps/web/src/shell/header.css` (new, 166 lines) keeps
  Bingo's look on the kit's header: the order (back link, brand, navigation, toggle, account;
  folded brand, toggle, Menu), the chip, the solid "Sign in", the buttons' padding, small type
  for the wordmark (Bingo loads no kit `fit.css`, so the kit's text floor is unset), the Menu
  button hidden while unfolded (it is also `.sbr-btn`, which `base.css` shows), the fold below
  960 px whatever fits, and the account hidden until the session is known. The test ids
  `open-sign-in` and `open-register` are the kit's `sign-in` and `register`; the e2e sign-in
  waits for `[data-session="known"]`. The back link's accessible name is "Seasonal
  Entertainment" (its arrow is drawn, not read); on a phone its own row stays as short as Bingo's was (`min-height: 0` in `shell/header.css`): the kit's 44 px target (K29) made the phone bar 23 px taller and pushed the card out of a 375×667 window in website mode (the fit audit's sweep, 2026-11-23). That waives K29's target for this link on phones, as Bingo's own link did (owner decision of 2026-11-23, §6a).
