# Fit audit — every screen at every size and font size

Status: measured 2026-11-20 on master `c3b76c1` (§1–§5, the state before the fixes); fixed on branch `docs/fit-audit` and measured again (§6). Owner request of 2026-11-20: every page adapts to the space the user really has (window size and font size); owner decision of the same day: no text below 14 px at the browser's default font. The card numbers' floor was then decided at 16 px (§6).

## 1. How it was measured

- Script: [e2e/acceptance/fitAudit.spec.ts](../../e2e/acceptance/fitAudit.spec.ts) with the in-page probe [e2e/acceptance/fitProbe.ts](../../e2e/acceptance/fitProbe.ts). It is an acceptance spec, so CI and `pnpm verify` skip it. Run it with `SBR_ACCEPTANCE=1 SBR_E2E_BROWSER=chromium pnpm exec playwright test -c e2e/playwright.config.ts acceptance/fitAudit.spec.ts --workers=1` (about 16 minutes, Chromium, against the running dev stack). It writes one JSON line per measurement to `reports/logs/fit-*.jsonl`.
- 28 screens: the routes of `apps/web/src/shell/router.ts` and the states a player, host or guest sees. They were reached in a real royale (20 players: the host playing along, one invited player, bots; fast test rules, host draws, the host starts each round) and a real classic match (11 players). Both matches were aborted or had finished by the end; no account was created.
- 7 window sizes: 360×640, 390×844, 768×1024, 1280×720, 1366×768, 1920×1080, 2560×1440.
- 3 font sizes: the root font at 16 px (browser default), 20 px (125 %) and 24 px (150 %). Every size in the client is in rem and every media query is in px, so this behaves like a larger browser font. Light theme.
- 7 × 3 × 28 = **588 combinations measured**; nothing was dropped for time.
- Per combination:
  - text below 14 px × the font scale (17.5 px at 125 %, 21 px at 150 %);
  - card numbers below 16 px × the font scale;
  - text cut by an ancestor's overflow or an ellipsis;
  - boxes wider than the window or outside it, and horizontal page scroll;
  - text that covers other text or is covered by another element;
  - on round screens: page scroll (the `playerFit` rule, desktops only) and the ball, the drawn numbers and the card(s) or Draw next wholly in the window.
- Not counted:
  - text only for screen readers;
  - the free centre's ★;
  - text scrolled away inside a scrolling box (a standings list or the top bar's menu strip).
- Screenshots in `reports/screens/latest/` (not committed):
  - `fit-<screen>-<size>-<font>-light.jpg` and `-dark.jpg` for every combination with a finding;
  - `fit-<screen>-390x844-16-light.jpg` as the passing reference where that combination passes. At 1920×1080 no screen passes (finding B, the brand subline), so its finding shots serve as the reference.
  - `fit-cards-<size>-<12|14|16>.jpg` for §4.

## 2. Summary

Codes, per cell at 16 · 20 · 24 px:

| Code | Meaning                                                  |
| ---- | -------------------------------------------------------- |
| ✓    | pass                                                     |
| B    | the brand subline below the minimum (finding F1)         |
| L    | the LIVE badge below the minimum (F2)                    |
| T    | other text below the minimum (F3, F4)                    |
| N    | card numbers below 16 px × scale (F5, F6)                |
| X    | text cut (F7)                                            |
| W    | wider than the window or horizontal scroll (F8–F11)      |
| V    | overlap (F4, F14, F15)                                   |
| S    | page scroll on a desktop round screen (F12)              |
| K    | key part of a round screen outside the window (F12, F13) |

| Screen              | 360x640           | 390x844         | 768x1024        | 1280x720            | 1366x768           | 1920x1080       | 2560x1440      |
| ------------------- | ----------------- | --------------- | --------------- | ------------------- | ------------------ | --------------- | -------------- |
| player-classic      | LK · LWK · LWK    | L · LK · LWVK   | BL · BLK · BLK  | BL · BLN · BLNSK    | BL · BL · BLNSK    | BL · BL · BL    | BL · BL · BL   |
| maintenance         | ✓ · ✓ · ✓         | ✓ · ✓ · ✓       | B · B · B       | B · B · B           | B · B · B          | B · B · B       | B · B · B      |
| lobby-guest         | ✓ · ✓ · ✓         | ✓ · ✓ · ✓       | B · B · B       | B · B · B           | B · B · B          | B · B · B       | B · B · B      |
| sign-in             | ✓ · ✓ · ✓         | ✓ · ✓ · ✓       | B · B · B       | B · B · B           | B · B · B          | B · B · B       | B · B · B      |
| register            | ✓ · ✓ · ✓         | ✓ · ✓ · ✓       | B · B · B       | B · B · B           | B · B · B          | B · B · B       | B · B · B      |
| forgot-password     | ✓ · ✓ · ✓         | ✓ · ✓ · ✓       | B · B · B       | B · B · B           | B · B · B          | B · B · B       | B · B · B      |
| reset-password      | ✓ · ✓ · ✓         | ✓ · ✓ · ✓       | B · B · B       | B · B · B           | B · B · B          | B · B · B       | B · B · B      |
| leaderboard         | X · X · XW        | ✓ · X · XW      | B · B · B       | B · B · B           | B · B · B          | B · B · B       | B · B · B      |
| profile             | ✓ · ✓ · ✓         | ✓ · ✓ · ✓       | B · B · B       | B · B · B           | B · B · B          | B · B · B       | B · B · B      |
| lobby               | ✓ · ✓ · ✓         | ✓ · ✓ · ✓       | B · B · B       | B · B · B           | B · B · B          | B · B · B       | B · B · B      |
| account             | ✓ · ✓ · ✓         | ✓ · ✓ · ✓       | B · B · B       | B · B · B           | B · B · B          | B · B · B       | B · B · B      |
| host-new            | T · T · T         | T · T · T       | BT · BT · BT    | BT · BT · BT        | BT · BT · BT       | BT · BT · BT    | BT · BT · BT   |
| quicktest           | TV · TV · TV      | T · TV · TV     | BT · BT · BT    | BT · BT · BT        | BT · BT · BT       | BT · BT · BT    | BT · BT · BT   |
| console-lobby       | ✓ · ✓ · ✓         | ✓ · ✓ · ✓       | B · B · B       | B · B · B           | B · B · B          | B · B · B       | B · B · B      |
| waiting-room        | ✓ · ✓ · ✓         | ✓ · ✓ · ✓       | B · B · B       | B · B · B           | B · B · B          | B · B · B       | B · B · B      |
| my-matches          | ✓ · ✓ · ✓         | ✓ · ✓ · ✓       | B · B · B       | B · B · B           | B · B · B          | B · B · B       | B · B · B      |
| console-round       | LK · LXK · LXK    | L · LXK · LXK   | BL · BL · BL    | BL · BL · BL        | BL · BL · BL       | BL · BL · BL    | BL · BL · BL   |
| player-royale       | LK · LXWK · LXWK  | L · LXK · LXWVK | BL · BLK · BLK  | BL · BLN · BLNSK    | BL · BL · BLNSK    | BL · BL · BL    | BL · BL · BL   |
| spectator-4         | LNK · LNXK · LNXK | LN · LNX · LNXK | BLN · BLN · BLN | BLN · BLNV · BLNVSK | BLN · BLN · BLNVSK | BL · BLN · BLN  | BL · BL · BL   |
| spectator-1         | LK · LXK · LXK    | LK · LXK · LXK  | BLK · BLK · BLK | BL · BLN · BLNSK    | BL · BL · BLNSK    | BL · BL · BL    | BL · BL · BL   |
| interlude-player    | L · LXW · LXW     | L · LW · LXWV   | BL · BL · BL    | BL · BL · BLN       | BL · BL · BL       | BL · BL · BL    | BL · BL · BL   |
| interlude-console   | L · LX · LX       | L · L · LX      | BL · BL · BL    | BL · BL · BL        | BL · BL · BL       | BL · BL · BL    | BL · BL · BL   |
| interlude-spectator | LN · LNX · LNX    | LN · LN · LNX   | BLN · BLN · BLN | BLN · BLN · BLN     | BLN · BLN · BLN    | BLN · BLN · BLN | BL · BLN · BLN |
| results-player      | XW · XW · XW      | ✓ · XW · XW     | B · B · B       | BN · BN · BN        | BN · BN · BN       | BN · BN · BN    | BN · BN · BN   |
| results-spectator   | X · X · X         | ✓ · X · X       | B · B · B       | B · B · B           | B · B · B          | B · B · B       | B · B · B      |
| results-console     | X · X · X         | ✓ · X · X       | B · B · B       | B · B · B           | B · B · B          | B · B · B       | B · B · B      |
| verify              | ✓ · W · W         | ✓ · W · W       | B · B · B       | B · B · B           | B · B · B          | B · B · B       | B · B · B      |
| website-guest       | ✓ · ✓ · ✓         | ✓ · ✓ · ✓       | B · B · B       | B · B · B           | B · B · B          | B · B · B       | B · B · B      |

504 of 588 combinations have at least one finding. Most of them come from two lines of CSS (F1, F2). Without those two, 23 of the 28 screens pass at 1366×768 at the default font (the five others: F3, F4, F5, F6).

## 3. Findings

Each finding has its cause (file:line of the rule) and an example screenshot (`reports/screens/latest/`, light and dark).

### Text below the minimum

- **F1 — Brand subline "SEASONAL ENTERTAINMENT", 12 px.**
  - Where: every screen from 768 px wide, at every font (15 px at 125 %, 18 px at 150 %). Phones hide it.
  - Selector: `.shell-brand small` (since the kit's header, v0.11: `.sk-header-brand small`).
  - Cause: `font-size: 0.75rem` at `apps/web/src/shell/shell.css` (line 88 then; the rule is now
    `apps/web/src/shell/header.css`, `.sk-header-brand small`).
  - Shot: `fit-lobby-1280x720-16`.
- **F2 — LIVE badge, 12 px.**
  - Where: player, spectator and console screens during a round and in the interlude, at every size and font (15 / 18 px at 125 / 150 %).
  - Selector: `.sbr-badge-live`.
  - Cause: `font-size: 0.75rem` at [packages/ui/src/base.css:198](../../packages/ui/src/base.css#L198).
  - Shot: `fit-player-royale-1280x720-16`.
- **F3 — Form hints in `<small>`, 13.3 px.**
  - Where: "Host a match" ("Everyone plays at the same time.") at every size and font (16.7 / 20 px at 125 / 150 %).
  - Selector: `[data-testid="create-match"] fieldset > small.sbr-muted`.
  - Cause: no font size is set for `small`, so the browser's `smaller` applies. The element was at `apps/web/src/host/AsyncFields.tsx:90` (the asynchronous pace fields, removed with the host form in admin-area §9 piece 4). The same `<small class="sbr-muted">` was used at AsyncFields.tsx:228, TimingFields.tsx:210 and `account/formParts.tsx:42`, which were not on screen in the measured states.
  - Shot: `fit-host-new-1280x720-16`.
- **F4 — Development badge "Bingo · dev · 5390", 12 px (development only).**
  - Where: the Quick Test page, the only measured screen that shows it. On phones the page's choice tiles also cover it.
  - Selector: `[data-testid="dev-badge"]`.
  - Cause: `fontSize: '0.75rem'` at [apps/web/src/components/DevBadge.tsx:31](../../apps/web/src/components/DevBadge.tsx#L31).
  - Shot: `fit-quicktest-390x844-20`.

### Card numbers below 16 px

- **F5 — Spectator cards (top 4, and in the interlude): 12 px on desktops and 12.8 px on phones and tablets at the default font.**
  - At 125 % they are 15–16 px and at 150 % 18–19.2 px, still below 16 × scale, because the cell size follows the play area's height and width (container units), not the font.
  - At 1920×1080 the top 4 has 19.6 px numbers (the cells are larger there); the interlude's cards stay at 12 px.
  - Selector: `[data-testid^="watch-card-"]` cells.
  - Causes:
    - `--cell-font: 0.8rem` at [apps/web/src/game/watch.css:60](../../apps/web/src/game/watch.css#L60) (below 960 px);
    - `max(0.75rem, cell × 0.36)` at [watch.css:78](../../apps/web/src/game/watch.css#L78) (from 960 px);
    - the cell size at [watch.css:77](../../apps/web/src/game/watch.css#L77).
  - Shot: `fit-spectator-4-1280x720-16`.
- **F6 — Own card on the results screen: 13.8–14.7 px at the default font from 1280 px wide; on round screens below 16 × scale at 125 % and 150 % on desktops.**
  - Values: 17.3–18.4 px at 125 % and 20.7–23.3 px at 150 % (1280–2560 px wide).
  - Selector: `[data-testid^="owner-cell-"]`.
  - Causes:
    - `--cell-font: max(0.85rem, cell × 0.36)` at [apps/web/src/game/arena.css:226](../../apps/web/src/game/arena.css#L226);
    - the cell size from the box height at [arena.css:225](../../apps/web/src/game/arena.css#L225).
  - Shot: `fit-results-player-1280x720-16`.

### Text cut

- **F7 — Player names shortened with an ellipsis on phones at 125 % and 150 %, even six-character names ("bot-04").**
  - Where:
    - live standings (player, console, spectator);
    - the final placement's list and podium;
    - the interlude's top 3 and climber.
  - On the leaderboard names are cut on a 360 px phone already at the default font ("demo-01").
  - Causes:
    - `.rank-name` with `overflow: hidden; text-overflow: ellipsis` at [apps/web/src/components/results.css:90-96](../../apps/web/src/components/results.css#L90-L96), which sits beside fixed-width seasons and points;
    - `.podium-name` at [results.css:205-209](../../apps/web/src/components/results.css#L205-L209);
    - the leaderboard name link at [apps/web/src/league/league.css:90-95](../../apps/web/src/league/league.css#L90-L95).
  - Shots: `fit-results-console-390x844-20`, `fit-leaderboard-360x640-16`.

### Wider than the window

- **F8 — Own card wider than a phone at 125 % and 150 %, so the page scrolls sideways.**
  - Where: royale and classic player screen, interlude, results. The card spans −4 to 350 px on a 360 px screen.
  - Cause: `--cell-size: clamp(2.9rem, 15vw, 4.1rem)` at [apps/web/src/game/arena.css:266](../../apps/web/src/game/arena.css#L266). The minimum is in rem, so five cells grow with the font past the screen's width.
  - Shot: `fit-player-royale-360x640-20`.
- **F9 — The own status block (effects, seasons, note) wider than the column on phones.**
  - At 360×640 on the results screen already at the default font (5 px over); at 125 % on 390 px too.
  - Selector: `[data-testid^="owner-status-"]`.
  - Likely cause: the grid `.owner-status` at [apps/web/src/components/matchSide.css:19](../../apps/web/src/components/matchSide.css#L19) has no minimum width of 0 and holds `.season-item { white-space: nowrap }` ([matchSide.css:52](../../apps/web/src/components/matchSide.css#L52)). The probe saw the boxes, not the rule: to be confirmed when fixing.
  - Shot: `fit-results-player-360x640-16`.
- **F10 — "Verify this match" wider than a phone at 125 % and 150 %.**
  - The page's column runs from 51 to 413 px on a 360 or 390 px screen, so the page scrolls sideways.
  - The probe reports the column, not which child widens it. Candidates: the rounds table ([apps/web/src/game/game.css:153](../../apps/web/src/game/game.css#L153)) and the facts list ([game.css:134](../../apps/web/src/game/game.css#L134)).
  - Shot: `fit-verify-390x844-20`.
- **F11 — Leaderboard wider than a phone at 150 %.**
  - The page column runs from 61 to 421 px. Same kind as F10: the table [apps/web/src/league/league.css](../../apps/web/src/league/league.css) (column widths and gaps, lines 70–94).
  - Shot: `fit-leaderboard-390x844-24`.

### Round screens: page scroll and parts out of view

- **F12 — Desktops at 150 %: at 1280×720 and 1366×768 the round screens scroll.**
  - Where: player royale and classic, spectator with 4 and with 1 card.
  - The own card or the watched cards end below the window. At 125 % and up to 1920×1080 at 150 % everything fits.
  - Cause: the arena's fixed rows in rem (title, rules lines, ball) take the height; the card box gets the rest ([arena.css:216-226](../../apps/web/src/game/arena.css#L216-L226)).
  - Shot: `fit-player-royale-1280x720-24`.
- **F13 — Phones and tablets: key parts below the window.**
  - At 360×640 even at the default font:
    - the own card, the watched cards and the console's Draw next.
  - At 390×844 at the default font: the followed card (spectator with 1 card).
  - At 125 % and 150 %:
    - the card on 390 and 768 px, Draw next on 390 px;
    - at 360 px with 150 % also the ball and the drawn numbers.
  - `e2e/playerFit.spec.ts` checks phones only at 390×844 and only player and spectator with the top 4.
  - Shots: `fit-player-royale-360x640-16`, `fit-console-round-390x844-16`.

### Overlaps

- **F14 — Match title covered by the LIVE badge or the "Open host console" button at 390×844, 150 %.**
  - Cause: the phone header grid `minmax(0, 1fr) auto` at [arena.css:118-147](../../apps/web/src/game/arena.css#L118-L147) does not wrap. The right part keeps its width and the title runs under it.
  - Shot: `fit-player-royale-390x844-24`.
- **F15 — Spectator card numbers touch their neighbours at 1280×720 and 1366×768 at 125 % and 150 %.**
  - The rem minimum of the number grows with the font; the cell (container units) does not (F5's rules).
  - Shot: `fit-spectator-4-1280x720-24`.
- F4 also has an overlap: the development badge sits under the Quick Test tiles on phones.

### Observed, not counted as a finding

- **O1 — The top bar takes a large share of a phone.**
  - Share of a 360×640 window: 26–34 % at the default font, 49–51 % at 150 %. The menu and the account buttons wrap to three or four rows.
  - Shot: `fit-results-console-360x640-24`.
- **O2 — The menu strip cuts "Leaderboard" at the right edge on a 360 px phone.**
  - The strip scrolls sideways, so the probe does not count it; nothing shows that more is there.
  - Shot: `fit-results-player-360x640-16`.

Findings per kind:

| Kind                            | Findings                             |
| ------------------------------- | ------------------------------------ |
| Small text                      | 4 (F1–F4)                            |
| Small card numbers              | 2 (F5, F6)                           |
| Cut text                        | 1 (F7, three places)                 |
| Wider than the window           | 4 (F8–F11)                           |
| Round screens out of the window | 2 (F12, F13)                         |
| Overlaps                        | 2 own (F14, F15), plus the one in F4 |

## 4. Spectator card numbers: the comparison

The top 4 in the spectator view, default font, with the number's minimum injected from the measuring script (no product change): today (the rules in F5), at least 14 px, at least 16 px.

- "Cards" counts what the view shows: 4 from 960 px wide, the first 2 below.
- "Whole" counts cards wholly inside the window without scrolling.

| Size      | Cards | Per row | Whole in window  | Today: number | 14 px   | 16 px   | Overflow / clipped |
| --------- | ----- | ------- | ---------------- | ------------- | ------- | ------- | ------------------ |
| 360×640   | 2     | 2       | 0 (page scrolls) | 12.8 px       | 14 px   | 16 px   | none at any floor  |
| 390×844   | 2     | 2       | 2 (page scrolls) | 12.8 px       | 14 px   | 16 px   | none               |
| 768×1024  | 2     | 2       | 2 (page scrolls) | 12.8 px       | 14 px   | 16 px   | none               |
| 1280×720  | 4     | 2       | 4                | 12 px         | 14 px   | 16 px   | none               |
| 1366×768  | 4     | 2       | 4                | 12 px         | 14 px   | 16 px   | none               |
| 1920×1080 | 4     | 2       | 4                | 19.6 px       | 19.6 px | 19.6 px | none               |
| 2560×1440 | 4     | 2       | 4                | 19.6 px       | 19.6 px | 19.6 px | none               |

- The floor changes only the number's size, never the number of cards. The view always shows the server's top 4 (2 on narrow screens); showing fewer, larger cards needs a code change.
- At the default font no number spills out of its cell at any floor. At 1280×720 a two-digit number at 16 px fits a cell of about 27 px.
- Above the default font, numbers at today's rules already touch at 1280×720 and 1366×768 (F15).
- Screenshots: `fit-cards-<size>-12.jpg`, `-14.jpg`, `-16.jpg` for each size, to view side by side.

## 5. Proposed fixes, by cause (as proposed; what was built is in §6.2)

1. **Fixed small sizes:** F1, F2 and F4 use `--font-size-small` (0.875rem) instead of 0.75rem; F3 gives `small` the same size in `packages/ui/src/base.css`.
2. **Card numbers on the owner's floor:** the watch and own card `--cell-font` minimums become the owner's choice from §4 (0.875rem or 1rem) (F5, F6).
3. **Cell size from the font:** the cells grow with the font as their numbers do: a rem part in the container-unit `min()` or a font-based floor. The card box then scrolls or the layout changes rather than the numbers touching (F6, F12, F15).
4. **Phone card width:** the own card's cell size has a ceiling of a fifth of the screen width minus padding, so it never passes the screen (F8).
5. **Shrinkable columns:** `min-width: 0` (or `minmax(0, 1fr)`) on the owner status grid, the verify page and the leaderboard table, and long codes wrap (F9, F10, F11).
6. **Names before numbers on phones:** in standings, results and the leaderboard a name gets the row's free width first. Points and seasons move under the name, or wrap, at large fonts instead of the name being cut (F7).
7. **Phone header:** the arena's title line wraps the LIVE badge and host button under the title when space is short (F14). The top bar folds its menu and account buttons into one menu on phones (O1, O2).
8. **Round screens on small phones and large fonts:** the playerFit rule extends to 360×640, the console on phones, and 125 % / 150 % fonts. The arena gives its fixed rows less height at large fonts (F12, F13).

## 6. After the fixes

Owner decisions of 2026-11-20: text is never below 14 px at the browser's default font; card numbers (own card and spectator cards) are never below 16 px; on phones the top bar folds the menu items and the account buttons into one menu button, desktop stays as it was.

Measured again on the branch with the same script (`SBR_FIT_TAG=fitafter`): the same 28 screens, 7 sizes and 3 fonts, 588 combinations, nothing dropped. Logs `reports/logs/fitafter-*.jsonl`, screenshots `reports/screens/latest/fitafter-*.jpg` (the first audit's `fit-*` files are kept as the "before").

### 6.1 Before and after

Combinations with each code (§2):

| Code | Meaning                                       | Before | After |
| ---- | --------------------------------------------- | -----: | ----: |
| B    | brand subline below the minimum               |    420 |     0 |
| L    | LIVE badge below the minimum                  |    168 |     0 |
| T    | other text below the minimum                  |     42 |     0 |
| N    | card numbers below 16 px × scale              |     59 |     0 |
| X    | text cut                                      |     45 |     0 |
| W    | wider than the window, sideways scroll        |     21 |     0 |
| V    | overlap                                       |     11 |     4 |
| S    | page scroll on a desktop round screen         |      8 |     0 |
| K    | key part of a round screen outside the window |     40 |    26 |

| Font            | With a finding, before | After |
| --------------- | ---------------------: | ----: |
| 16 px (default) |             164 of 196 |     0 |
| 20 px (125 %)   |             170 of 196 |    11 |
| 24 px (150 %)   |             170 of 196 |    19 |
| All             |             504 of 588 |    30 |

Findings per kind:

| Kind                            | Before                     | After                                            |
| ------------------------------- | -------------------------- | ------------------------------------------------ |
| Small text                      | 4 (F1–F4)                  | 0                                                |
| Small card numbers              | 2 (F5, F6)                 | 0                                                |
| Cut text                        | 1 (F7, three places)       | 0                                                |
| Wider than the window           | 4 (F8–F11)                 | 0                                                |
| Round screens out of the window | 2 (F12, F13)               | F12: 0; F13 only at 125 % / 150 % (R1–R4)        |
| Overlaps                        | 2 (F14, F15) and F4's      | F14, F15: 0; F4's overlap remains (R5)           |
| Observed (O1, O2)               | top bar up to half a phone | one row: 11 % of a 360×640 phone (22 % at 150 %) |

### 6.2 What closed each finding

- **F1–F4:** the brand subline, the LIVE badge and the development badge use `--font-size-small`; `small` gets it in `packages/ui/src/base.css`. `apps/web/src/minTextSize.test.ts` reads every stylesheet and component for a fixed text size below 14 px, a card number below 16 px or an ellipsis.
- **F5, F6, F15:** `--cell-font` floors at 1rem on the own card, the watched cards and the CellFace fallback; the cells have rem floors (`apps/web/src/game/liveCard.css`, `watch.css`), so at a large font they grow with their numbers. Where the cards then do not fit, the play area's box scrolls (desktop) or the two watched cards scroll sideways in their row (phone) instead of the numbers shrinking.
- **F7:** rank rows keep the name whole and move seasons and points to a second line when narrow; a podium name stays on one line and is never broken inside (not "dev-" / "player-2"): below 46rem, the width three 24-character names need side by side, the podium shows its steps as rows (phones, tablets, a large font); a narrow leaderboard shows the figures under the name. No `text-overflow: ellipsis` is left.
- **Watched cards side by side:** they share their row's height and the heading takes the spare room, so a heading that wraps ("#1 dev-player-2 · 37 pts") no longer puts one grid lower than its neighbour (`watch.css`; playerFit checks it with a 24-character name).
- **F8:** on phones and tablets the cards take their cells from their box's width (container units), not the window's.
- **F9–F11:** the arena's columns are `minmax(0, 1fr)`; the seasons line wraps between seasons; "Verify this match" scrolls its rounds table inside a focusable box; on phones the page margin and the panel padding stop growing with the font (unchanged at the default font).
- **F12:** the play area's minimum height is `min(20rem, 50vh)`; the standings keep `min(14rem, 60%)` of the side column, so the own row's strip stays whole at 150 %.
- **F13:** on phones the ball is at most a quarter of the width and the own and followed cards also follow the window's height, so at the default font ball, drawn numbers and the whole card (or the watched cards, or Draw next) fit a 360×640 phone (own cells 38 px there).
- **F14:** the arena's title line wraps the host button and LIVE under the title.
- **O1, O2:** below 960 px the top bar is one row: brand, theme toggle and "Menu" (Bingo's `MenuFold.tsx` then; since v0.11 the kit's `AppHeader` in `apps/web/src/shell/Header.tsx`, folded below 960 px by `apps/web/src/shell/header.css`). The menu opens a panel with the links and the account (name, Sign out, Dev sign-in in development, Chat in website mode): `aria-expanded`, the focus moves into the panel, Escape closes it and returns the focus; it also closes on a click outside, a new route, another sign-in or the chat opening. "← Seasonal Entertainment" stays at the top left in website mode.
- **Kept so:** `e2e/playerFit.spec.ts` measures console, player and spectator at 360×640, 390×844 and 1280×720 at 100, 125 and 150 % (Chromium, about 40 s): nothing below the minimums, nothing cut, covered or wider than the window, the key parts in view at the default font on a phone and at every font on the desktop.

### 6.3 What remains, and why

- **R1 — Own card below the window on phones at 125 % and 150 %** (360×640, 390×844; royale and classic; 8 combinations). The numbers stay at 16 px × the font scale, so the cells cannot shrink further; the ball and the drawn numbers stay in view and the card follows below. Decided by the owner (below): the page scrolls to it.
- **R2 — Desktop at 125 % / 150 % (1280×720, 1366×768): the own card (150 %) and the watched cards (125 %, 150 %) are taller than the play area's box** (10 combinations). The page does not scroll; the cards scroll inside their box, as asked for when 16 px numbers do not fit. The box itself is whole in the window (playerFit checks it).
- **R3 — Host console on phones at 125 % / 150 %:** Draw next below the window (360×640 at 125 % and 150 %, 390×844 at 150 %), at 360×640 also the drawn numbers and at 150 % the ball (3 combinations). The console's header and controls above them grow with the font; decided by the owner (below): the page scrolls to it.
- **R4 — Spectator on phones at 125 % / 150 %:** the watched cards or the followed card end below the window (360×640; the followed card also at 390×844 / 150 %; 5 combinations), for the reason of R1.
- **R5 — Quick Test on phones at 125 % / 150 %:** the development badge (fixed at the bottom right) lies under the page's tiles (4 combinations). Development only; the badge lets clicks through.

None of these is covered by a decision of 2026-11-20: text and card numbers are at their minimums everywhere, and the phone bar is one row.

**Decided (owner, 2026-11-20):**

- Phones at 125 % / 150 % font: the page may scroll to the cards and to Draw next; nothing shrinks or hides. R1–R4 stay as they are.
- The menu folds below 960 px, tablets included.
- On phones Chat is one of the folded menu items.

### 6.4 Spectator cards after the fixes

Default font, the view as built (§4's 14 px and 16 px columns are the same now):

| Size      | Cards | Per row | Whole in window | Smallest number | Overflow                          |
| --------- | ----- | ------- | --------------- | --------------- | --------------------------------- |
| 360×640   | 2     | 2       | 2               | 16 px           | none (numbers close to the frame) |
| 390×844   | 2     | 2       | 2               | 16 px           | none                              |
| 768×1024  | 2     | 2       | 2               | 16 px           | none                              |
| 1280×720  | 4     | 2       | 4               | 16 px           | none                              |
| 1366×768  | 4     | 2       | 4               | 16 px           | none                              |
| 1920×1080 | 4     | 2       | 4               | 19.6 px         | none                              |
| 2560×1440 | 4     | 2       | 4               | 19.6 px         | none                              |

The number of cards is unchanged. At 360×640 the 16 px numbers nearly filled their 27 px cells in this measurement; after it the phone's watched cards got a narrower padding and corner, which gives each cell about 1.6 px more.

### 6.5 Screenshots for the owner

In `reports/screens/latest/` (not committed), from a royale played with `e2e/acceptance/fitFixPlay.spec.ts` (fast rules). One full-length realtime royale was played with `SBR_FIT_FULL=1` before the last two fixes: 19.7 minutes, no finding.

- `fitfix-<screen>-<390x844|1280x720>-<light|dark>.jpg` for `lobby`, `player`, `spectator`, `interlude`, `results`, `leaderboard`;
- `fitfix-menu-closed-390x844-<light|dark>.jpg` and `fitfix-menu-open-390x844-light.jpg`;
- before: the `fit-*` shots of §3; after, per combination: `fitafter-*`.

## 7. Website mode: the baseline for the docked layout (2026-11-23)

Measurement only; nothing in the layout changed. The baseline for the docked layout (kit K18, docs/concepts/kit-adoption.md §5 "B7"), where the website's chat would sit beside the match instead of over it.

**How:** `e2e/acceptance/fitAudit.spec.ts`, test "every match screen in website mode" (`SBR_ACCEPTANCE=1`, Chromium; `e2e/acceptance/websiteSweep.ts`). The production client inside the website stand-in (`e2e/websiteStack.ts`), three stand-in members: a host, a player, a spectator. A royale (fast rules, host draws, 20 players with bots) from the lobby to the results, and a classic round. Twelve screens: console-lobby, waiting-room, console-round, player-royale, spectator-4, interlude (player, console, spectator), results (player, spectator, console), player-classic. Ten sizes: 1280×720, 1366×768, 1536×768, 1440×900, 1900×860, 1920×1080, 375×667, 360×780, 390×844, 430×932. Root font 16 px, light and dark, the website's chat closed and open. Each combination: the fit probe of §1, the round screens' key boxes, and axe (WCAG 2.0 and 2.1, A and AA) on the game's page without the chat frame. 480 measurements, one JSON line each in `reports/logs/fit-website-sweep.jsonl` (not committed); no screenshots.

**Chat closed:** no finding on any screen at any size by §1's rules. On the phones (375–430 px wide) every round screen (console, player, spectator, classic player) scrolls the page, as standalone does; the ball, the drawn numbers and the cards or Draw next stay inside the window (no key box out). Light and dark measure the same.

**Chat open:** the panel lies over the match. At 1900×860 and 1920×1080 nothing is covered. At 1280–1536 px wide (and 1440×900) it covers game text on every screen. On the phones it covers most of the screen. Text covered (probe "overlap" items, light theme; dark within a few):

| Screen              | 1280×720 | 1366×768 | 1536×768 | 1440×900 | 375×667 | 390×844 | 430×932 |
| ------------------- | -------: | -------: | -------: | -------: | ------: | ------: | ------: |
| console-lobby       |        1 |        1 |        0 |        0 |      13 |      15 |      16 |
| waiting-room        |        0 |        0 |        0 |        0 |      10 |       9 |       9 |
| console-round       |       40 |       43 |       43 |       55 |      18 |      21 |      29 |
| player-royale       |       30 |       24 |       17 |       24 |      44 |      49 |      52 |
| spectator-4         |       29 |       19 |       15 |       20 |      86 |      95 |      99 |
| interlude-player    |        4 |       13 |       12 |       13 |      25 |      20 |      31 |
| interlude-console   |       38 |       42 |       42 |       58 |      28 |      29 |      31 |
| interlude-spectator |        9 |       11 |        7 |       10 |      15 |      54 |      78 |
| results-player      |        6 |        7 |        7 |       11 |      21 |      34 |      42 |
| results-spectator   |        8 |        9 |        9 |       12 |      26 |      39 |      47 |
| results-console     |        7 |        5 |        0 |        3 |      25 |      37 |      48 |
| player-classic      |       20 |       15 |       14 |       15 |      44 |      45 |      48 |

What covers it: the chat frame (`iframe.chat-panel__frame`) and its close button (`chat-close`), for example the round's live badge, the player's status line and the seasons collected at 1280×720. The kit's docked layout (K18) puts the chat in a strip **under** the game (kit `src/react/ChatDock.tsx`: 190 px high, 150 px in a window under 760 px high, always in sight), so the game keeps its width and has less height; on a phone the chat is a bar at the bottom that opens a sheet over the match (§8 has what the docked layout measured).

**axe:** one rule, `scrollable-region-focusable` (serious): a region that scrolls but cannot get keyboard focus, in 192 of the 480 measurements (chat closed and open alike, both themes). The regions: the drawn numbers (`.draw-ticker`) on the three results screens at every size and on the player's and spectator's interludes; the standings (`ol[data-testid="standings"]`, `.rank-list`) on the console's interlude; the console round's list (`ol`) at half the sizes. The player's and spectator's round screens and the lobby side have none. A second run (the same tree, measuring the same findings everywhere else) also saw `color-contrast` once: the podium's names on the player's interlude, in its first measurement only (1920×1080, light, chat closed), most likely while the podium was still fading in; the other 39 measurements of that screen pass. No other WCAG A or AA rule fails on the game's pages.

## 8. Website mode on the docked layout (2026-11-24)

**How:** the same sweep as §7 (`e2e/acceptance/fitAudit.spec.ts`, "every match screen in website mode", `SBR_ACCEPTANCE=1`, Chromium; 480 measurements, twelve screens, ten sizes, light and dark), on the kit's docked layout (K18, `apps/web/src/shell/DockedChat.tsx`, `dock.css`): the chat is a strip under the game (kit `src/react/ChatDock.tsx`: 190 px high, 150 px in a window under 760 px high, always in sight) on a desktop, and the kit's bar at the bottom with a sheet on a phone. "Chat closed" and "open" measure the same page on a desktop (the strip is always there); on a phone "open" is the sheet over the game. Two things the sweep now also measures, because the game area scrolls inside a one-window page: the area's own scroll counts as page scroll, and a key box must lie inside the area above the strip (`area` in each line: its height and its content's).

**The chat covers no game text on any desktop size** (0 in every cell, all twelve screens; §7 had up to 58 at 1280–1536 px and 1440×900). The game area above the strip is 457 px high at 1280×720, 465 px at 1366×768 and 1536×768, 597 at 1440×900, 557 at 1900×860 and 777 at 1920×1080.

Text covered with the chat open (probe "overlap" items, light theme; the desktop cells are 0 because nothing lies under the strip; on a phone the open sheet covers the game by the kit's design, so those cells are the sheet; closed, the phone's bar covers nothing):

| Screen              | 1280×720 | 1366×768 | 1536×768 | 1440×900 | 375×667 | 390×844 | 430×932 |
| ------------------- | -------: | -------: | -------: | -------: | ------: | ------: | ------: |
| console-lobby       |        0 |        0 |        0 |        0 |       4 |       7 |       6 |
| waiting-room        |        0 |        0 |        0 |        0 |       7 |       5 |       2 |
| console-round       |        0 |        0 |        0 |        0 |       9 |       9 |      11 |
| player-royale       |        0 |        0 |        0 |        0 |      35 |      30 |      33 |
| spectator-4         |        0 |        0 |        0 |        0 |      69 |      76 |      68 |
| interlude-player    |        0 |        0 |        0 |        0 |       8 |      16 |      26 |
| interlude-console   |        0 |        0 |        0 |        0 |      20 |      18 |      14 |
| interlude-spectator |        0 |        0 |        0 |        0 |      16 |      14 |      40 |
| results-player      |        0 |        0 |        0 |        0 |       9 |      19 |      29 |
| results-spectator   |        0 |        0 |        0 |        0 |      14 |      28 |      33 |
| results-console     |        0 |        0 |        0 |        0 |      13 |      23 |      28 |
| player-classic      |        0 |        0 |        0 |        0 |      35 |      30 |      29 |

**The board whole without scrolling:** at every desktop size, on every screen the player and the host have (the player's card and the console's round, lobby, interludes and results), nothing scrolls and every key box (ball, drawn numbers, card, Draw next) is inside the game area, **even at 1280×720 with the 150 px strip**. One exception: the spectator's four watched cards (`spectator-4`, and a player who is out) do not fit above the strip at **1280×720, 1366×768 and 1536×768** (game area 457–465 px): their box scrolls inside the arena (it is a named tab stop) and the strip stays in sight. They fit at 1440×900 (597 px), 1900×860 and 1920×1080, so the whole four need between 466 and 557 px of game area. What would give it room is the owner's call: the strip cannot go under 150 px (the kit's least, the owner's), the text cannot go under 14 px, so the choice is fewer cards at those sizes (the top two beside each other, or a "show more") or a shorter header; nothing was changed to hide them.

**Phones:** the chat bar lies wholly inside the window at all four sizes in every one of the 192 phone measurements (a second run of the four phone sizes recorded its box, sheet closed and open, both themes, all twelve screens), and the sheet opens and closes (`e2e/chatEmbed.spec.ts`). Every round screen scrolls inside the game area as it scrolled the page before (§7). The player's card is not wholly in view above the bar at 375×667 and now also at 360×780 (§7: 375×667 only): the bar and the sheet's room take about 70 px from the area. It scrolls inside the area, and the chat bar stays in reach.

**axe:** `scrollable-region-focusable` is gone (§7 had 192 of 480). Getting there took 3a (the drawn numbers and the standings list) and the regions the shorter area made scroll at 1280×720: the patterns panel, the status panel and the cards' box, each now focusable and named. One `color-contrast` hit remains, once: the podium's names on the spectator's interlude, in its first measurement (1280×720, light), the podium still fading in as in §7; the other 39 measurements of that screen pass.

### 8.1 After the side column moved beside the title (2026-11-24, owner decision)

**What changed:** in website mode the side column starts under the LIVE badge, beside the title (kit-adoption.md §8, K18 step 1b), and a box whose content continues below its edge says so ("↓ More below", `useScrollHint`). **How:** the §8 sweep narrowed with `SBR_SWEEP_SCREENS` (player-royale, spectator-4, console-round, results-player, results-spectator, results-console), `SBR_SWEEP_THEMES=light` and the six desktop sizes plus 390×844, with the strip shown on a desktop and the sheet closed on the phone (`SBR_SWEEP_CHAT`, 84 measurements, `e2e/acceptance/websiteSweep.ts`); the probe's "overlap" counts text under the chat, not game elements over each other, so the overlap check is a one-off comparison of the touched elements' boxes (ball, ticker, rules line, title, side column and its panels, cards, controls, patterns' rows; run at the six sizes for the player, the spectator and the console, not committed): **0 pairs intersect**.

- **The three findings of the review pictures are gone:** the patterns panel over the seasons line (player, 1280×720: the status panel was cut to 52 of 136 px and the patterns to 65 of 145; both are whole now, all four pattern rows show without scrolling at 1280×720 and 1366×768), the ball over the console's rules line (the console's header, rules line and grid shared two rows), and the standings' last row cut with no sign. The podium on the results screens is below the area's edge by design (1538–1718 px of content at 1280×720 in 449–457 px of area); it now carries the sign.
- **Standings get the rest:** at 1280×720 the player's column has 165 px for them under the whole status and patterns panels (the rows scroll inside, the own row stays pinned), the spectator's 264 px (no status panel); the console's standings run the full height beside the controls. Draw next is 4 rem high (was 5.5 rem) and the controls' panels sit closer, so Draw next, the speed switch and Abort are whole at 1280×720 and 1366×768 (362 px of content in 324 before; the controls' box does not scroll at any desktop size).
- **Fit above the strip (light, strip shown), the four screens at the six desktop sizes:** findings 0 everywhere except the spectator's four watched cards at 1280×720, 1366×768 and 1536×768 (area 457–465 px; closed in §8.2; they now fit at 1900×860, 557 px, as at 1440×900 and 1920×1080: the rules line is back 12 px closer under the title). Their box scrolls and says so. Text under 14 px and card numbers under 16 px: 0. axe: 0 violations in all 84 measurements.
- **Phones (390×844, sheet closed):** the game scrolls inside the area as before (1494–1807 px of content in 643 px); the sign shows at the bottom edge, so the cut line under the card or the cards is no longer silent. Nothing changed in the phone layout.
- **Standalone, 1280×720** (`SBR_FIT_SIZES=1280x720`: the pages, a royale from the lobby to the results, a classic round): the same findings as the head before this change (the spectator's cards; the classic card at 150 % font), nothing new; no standalone rule was touched (`dockSide.css` and the sign are scoped under the dock).

### 8.2 The spectator's four cards whole and more places on the results screen (2026-11-24, owner decision)

**What changed:** kit-adoption.md §8, K18 step 1c (`shell/dockWatch.css`, `shell/dockResults.css`, both under the dock, desktop from 960 px; every size from the kit's tokens). **How:** the §8 sweep narrowed to spectator-4, results-player, player-royale and console-round, light, strip shown, the six desktop sizes (`SBR_SWEEP_*`, `e2e/acceptance/websiteSweep.ts`), plus a throwaway spec (not committed) that counts the places whole above the strip (podium steps and ranked rows whose bottom edge lies inside the game area).

- **Spectator (Part A), what each step needed at 1280×720 / 1366×768 / 1536×768:** the cards' box has 336 / 342 / 342 px (before) and the cards need 431 px. Step 1 (cards: 24 px cell floor, no heading gap, letters at 14 px): 383 px needed, 47 / 41 / 41 px short. Step 2 (title and stage line on one line, rules line at 14 px; the block 57 px instead of 121 px): the box has 396 / 404 / 404 px, the cards need 383 px at most; box scroll 0. At 1440×900, 1900×860 and 1920×1080 the box is 536 / 496 / 716 px and scrolls 0 as before. Step 3 (the ball) not needed. Findings 0 at all six sizes, axe 0, text under 14 px 0, card numbers under 16 px 0.
- **Results (Part B), places whole above the strip** (1280×720, 1366×768, 1536×768, 1440×900, 1900×860, 1920×1080): before 2, 0, 0, 5, 4, 9; after 7, 7, 7, 12, 11, 20 (of 20). The panel's content is 1181, 1205 and 1184 px in 457, 465 and 465 px of area at the three small sizes, so the box still scrolls and says so ("↓ More below").
- **Player and console unchanged:** findings 0 at the six sizes, all four pattern rows whole, Draw next, the switch and Abort whole; the replaced token values moved the side column by at most 4 px.
- **Standalone, 1280×720** (pages, a royale, a classic round): findings 0 at the 16 px root font; the findings that remain are at 125 % / 150 % font (20 / 24 px): the spectator's cards, and the player's card in the royale and the classic round. No standalone rule was touched (both new files and the token swaps are under `.sk-docked-main`), so these are the findings of the head before this change.

### 8.3 White disc, Patterns and Standings side by side, the sign in its own band (2026-11-24, owner decisions)

**What changed:** kit-adoption.md §8, K18 step 1e. **How:** the §8 sweep narrowed to console-round, player-royale, spectator-4 and results-player, **light and dark**, the six desktop sizes, strip shown (48 measurements, `e2e/acceptance/websiteSweep.ts`; it now also logs `standings` and `places`, both counted above the "More below" strip, and saves `<screen>-<size>-<theme>.png`).

- **Findings 0, axe 0** in all 48 measurements, both themes; no text under 14 px, no card number under 16 px; the spectator's four cards whole (box scroll 0) at all six sizes.
- **Standings rows whole** (1280×720, 1366×768, 1536×768, 1440×900, 1900×860, 1920×1080), before (strip-less count) and after (above the strip): player 1, 1, 1, 3, 2, 9 and 7, 8, 8, 11, 11, 17; spectator 5, 5, 5, 8, 7, 13 and 7, 8, 8, 12, 11, 17; the console's column unchanged (8, 8, 8, 12, 11, 17 above the strip). At 1280×720 the player has 7 rows (4 or more asked).
- **Results places whole** above the strip: 7, 7, 7, 13, 11, 20 (the same count as before, measured stricter now: a row under the strip does not count).
- **Not-earned marks in the dark theme:** the tokens give a dark disc (`--color-surface`) with a grey-blue ring (`--color-border-strong`): different from the coloured icons at a glance, on the coloured podium steps a dark disc with a ring, readable.
- **Standalone, 1280×720** (pages, a royale, a classic round): see the standalone line of §8.2; nothing standalone was touched (the new rules sit under `.sk-docked-main` / `.sk-docked`); the SeasonIcon, SeasonSet and podium changes apply to standalone too (same look everywhere), they do not change any size.

### 8.4 Large fonts: the match screens stack (2026-11-26, owner decision)

At a 32 px root font and 1280×720 the docked player round's title, status lines and side column lay over each other: the layouts asked the window's pixels, and the side column's minimum (13 spacing steps) was 1040 px there.

- **Rule:** the desktop layouts apply from 48 root-font widths of page (`page` container, `shell/shell.css`; 01 §13). 16 to 24 px are unchanged at every desktop size; 32 px stacks up to 1536 px wide.
- **Also:** the docked side column's panels keep their text height (`shell/dockSide.css`), and a phone's own card is bounded by its box's width (`game/liveCard.css`).
- **Measured** with `SBR_SWEEP_FONTS` (website sweep) and `SBR_FIT_FONTS` (standalone audit); results in MORNING.md, "Kit 0.22". The probe does not report a partial overlap under a quarter of the smaller box; `e2e/chatEmbed.spec.ts` checks the boxes themselves.

## 9. The kit's sweep over the match screens (2026-11-26)

`SBR_SWEEP_KIT=1` makes the audit look at the same screens with the kit's `sweep` (K67) instead of measuring them (`e2e/acceptance/kitSweep.ts`): the six desktop sizes, 360×780, 390×844 and 430×932, root font 16 and 32 px, light and dark, the website screens (the lobby and the open menu included) and the standalone ones. Findings go to `reports/logs/<tag>-kit-sweep.log`.

```
SBR_ACCEPTANCE=1 SBR_SWEEP_KIT=1 pnpm exec playwright test -c e2e/playwright.config.ts e2e/acceptance/fitAudit.spec.ts --project=chromium
```
