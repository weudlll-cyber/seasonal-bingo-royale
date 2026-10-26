# 01 — Game Design Document

> Part of the Seasonal Bingo Royale specification. Index: [README](README.md).
> Every rule in this document that carries a number is a **configurable default**, not a constant. The authoritative list of configuration keys is in [11-admin-panel.md](11-admin-panel.md) §4.

## 1. Vision

Seasonal Bingo Royale is classic 75-ball Bingo turned into a multi-round elimination tournament. The four Seasonal Tokens seasons — Spring, Summer, Autumn, Winter — are built into the card itself: each card carries four season cells, and marking them triggers configurable bonuses. Collecting all four in one match triggers **Season Complete**.

The same match engine runs a fast **realtime** match (draws every few seconds, players watching live) and a slow **asynchronous** match (draws every few minutes or hours, players dropping in whenever they like).

### 1.1 Fixed product facts

| Fact | Source |
|---|---|
| No prizes of monetary value. No payout, no wagers, no token transfers. Players compete for placements and a leaderboard. | Owner decision, 2026-10-19 |
| The game is a standalone product and must also be easy to embed into the Seasonal Entertainment website. | Owner decision, 2026-10-19 |
| Launch sizing: up to ~200 concurrent players. | Owner decision, 2026-10-19 |
| All source code, specs and repository docs in English. Player-facing UI in English. | Owner standing rule |

Because nothing of value can be won or bought, the game is a skill-free game of chance **without stake**, which keeps it outside gambling regulation. Any future change that adds a stake or a prize of value is a separate project that starts with a legal review — the data model deliberately has **no currency, balance or wallet fields** (see [04-database-design.md](04-database-design.md)).

## 2. Glossary

| Term | Meaning |
|---|---|
| **Match** | One complete tournament: from lobby to final ranking. |
| **Stage** | A section of a match with its own rules: `qualification`, `elimination`, `final`. |
| **Round** | One Bingo game inside a stage: fresh cards, a draw sequence, ends on a round-end condition. |
| **Draw** | One ball taken from the pool: a number 1–75. |
| **Card** | A 5×5 grid owned by one player for one round. |
| **Season cell** | One of four card cells tagged with a season. Marking it activates that season. |
| **Mark / daub** | A cell becomes marked when its number has been drawn (auto) or the player taps it (manual). |
| **Pattern** | A set of cells that, when all marked, counts as a Bingo (line, corners, X, full house, custom). |
| **Cut** | The elimination step at the end of a round or stage. |
| **Ruleset** | A versioned, named bundle of all gameplay configuration. A match is frozen to one ruleset version when it opens. |

## 3. Core loop

```
Lobby ─► Stage 1 (qualification) ─► Cut ─► Stage 2 (elimination) ─► Cut ─► … ─► Final ─► Ranking
            │ round 1 ─ round 2 …               │ round …                           │ round …
```

1. **Join.** Player enters a lobby for a scheduled or open match.
2. **Round starts.** Every active player receives a fresh card (or `cardsPerPlayer` cards).
3. **Draws.** The server draws numbers at the configured cadence.
4. **Marking.** Drawn numbers are marked (auto or manual — §6).
5. **Scoring.** Marks, patterns, season effects and speed add points (§8).
6. **Round end.** When the round-end condition is met (§7.3) the round closes.
7. **Cut.** At configured points, the lowest-ranked players are eliminated (§7.4).
8. **Final.** Finalists play the final stage; the winner and all placements are fixed.
9. **Leaderboard.** Match placements feed the season leaderboard (§10).

Eliminated players stay in the match as **spectators**: they keep watching and chatting, they do not play.

## 3a. Game types and prizes

A match is one of three **game types**, chosen by whoever starts the match (admin
or organiser). Sections §4–§9 of this document apply to the `royale` type unless
stated otherwise; the two classic types replace stages, cuts and the jackpot with
a single classic round.

| Game type | Draw pool | Card cells | Structure |
|---|---|---|---|
| `royale` | 75 numbers | 24 numbers + 4 season cells (one per season) + free centre | Multi-stage elimination with cuts, Season Complete and the seasonal jackpot — the specification as given in §4–§9. |
| `classicSeasons` | 75 numbers plus 4 season symbols (one per season) | 20 numbers + 4 season cells carrying the season symbol instead of a number + free centre | One classic 75-ball round, with season symbols drawn like numbers. Drawing a symbol marks that symbol's cell on every card. No stages, no cuts, no effects, no Season Complete bonus, no jackpot. |
| `classic` | 75 numbers | 24 numbers + free centre; no season cells | One plain classic 75-ball round, numbers only. |

The four season cells in `classicSeasons` still obey the §4 placement rule: four
different rows, four different columns, never the centre. Each cell shows the
season icon in place of a number. The symbol pool is drawn together with the
numbers from a single shared sequence, so a draw ends up as either a number or
a symbol, never both.

The classic types run in either `realtime` or `asynchronous` mode. Marking mode
and draw interval come from the ruleset (§5, §6).

### 3a.1 Classic prize catalogue

Both classic types play for a set of prizes ticked by the starter before start:

| Prize key | Awarded to | Points |
|---|---|---|
| `rows-1` | First player whose single card has 1 complete row. | 100 |
| `rows-2` | First player whose single card has 2 complete rows. | 200 |
| `rows-3` | First player whose single card has 3 complete rows. | 300 |
| `rows-4` | First player whose single card has 4 complete rows. | 400 |
| `rows-5` | First player whose single card has 5 complete rows (i.e. all rows). | 500 |
| `columns-1` … `columns-5` | Same for columns. | 100 × N |
| `oneDiagonal` | First player with either diagonal complete. | 150 |
| `bothDiagonals` | First player with both diagonals complete. | 300 |
| `fourCorners` | First player with the four corner cells marked. | 100 |
| `fullCard` | First player to mark every cell. | 500 |
| Custom library patterns | As defined per pattern. | per pattern |

Ticked by default (changeable before start, stored in the ruleset defaults, also
editable in admin): `rows-1`, `rows-2`, `fourCorners`, `oneDiagonal`, `fullCard`.

Rules:
- A prize is decided when the speed window of the draw that first completes it
  closes (§6), and goes to **everyone** who has it complete by then: players
  completing it on the same draw, and players who tap the missing number inside
  that window. After the window has closed the prize is no longer open.
- Draws continue until every ticked prize is decided; then the round ends when the
  speed window of that draw closes.
- Catalogue order (lowest to highest value), used for the placement tie-break
  below: `rows-1`, `columns-1`, `rows-2`, `columns-2`, `rows-3`, `columns-3`,
  `rows-4`, `columns-4`, `rows-5`, `columns-5`, `fourCorners`, `oneDiagonal`,
  `bothDiagonals`, custom patterns in library order, `fullCard` highest.

### 3a.2 Placement in classic types

Final placement in a classic round is computed from the awards:

1. Most valuable prize won (catalogue order; `fullCard` highest).
2. Number of prizes won.
3. Number of marks on the player's card at the end of the round.
4. Join timestamp (earlier first) — deterministic last resort.

Royale placement is unchanged (§7.5, §8.4).

### 3a.3 Leaderboard switch

A `countsForLeaderboard` flag is set per match. Default: on for `royale`, off for
the classic types. The season leaderboard (§10) counts only matches with the
flag on.

## 4. The card

- 5×5 grid, columns B-I-N-G-O, numbers from the classic ranges: B 1–15, I 16–30, N 31–45, G 46–60, O 61–75.
- **Column order (decided 2026-10-20):** in every column the numbers are in ascending order from top to bottom. Season cells (royale) and season symbol cells (`classicSeasons`) keep their positions; the numbers of that column fill the remaining cells in ascending order.
- The card shows the letters **B I N G O** above its columns.
- Center cell (N3) is a **free cell**, marked from the start (`card.freeCenter`, default `true`).
- **Four season cells** per card, one per season, placed at random non-center positions. A season cell still has its normal number; its season icon is shown on top.
- Constraint: the four season cells occupy four **different rows and four different columns**. This keeps Season Complete from ever being a single line by construction.
- Cards are generated by the server from the round seed (§9). The client never generates cards.
- `cardsPerPlayer`: default 1, max 4. Scoring is per player: the sum over all cards.

## 5. Draws

- The pool holds the 75 numbers. Draws are without replacement.
- A round ends at the latest when the pool is exhausted.
- A round never ends at the moment of a draw. When a round-end condition is met on a
  draw, the round ends once the speed window of that draw has closed, so its number
  can still be tapped (with bonus inside the window). The same holds for the last
  draw of the pool.
- Draw cadence is a ruleset value per mode:

| Mode | Default draw interval | Allowed range |
|---|---|---|
| Realtime | 5 s | 2 s – 60 s |
| Asynchronous | 15 min | 1 min – 24 h |

- Asynchronous matches may define **quiet hours** (no draws, e.g. 00:00–07:00 in the match’s time zone).
- **Draw control (decided 2026-10-20):** whoever starts a match chooses the draw mode:
  - `auto` — the next item is drawn after an interval the starter sets in seconds, within the allowed range of the table above;
  - `host` — the next item is drawn only when the host presses **Draw next**.

  The host can switch between the two modes at any time during the match, and change the `auto` interval. This applies to all three game types, realtime and asynchronous. The speed window (§6) always starts when a draw becomes visible. The draw order never depends on timing or mode: it is fixed by the match seed (§9).
- **Shortest interval (D12):** the timed-draw interval of a realtime match is at least 1 second longer than the match's longest tap time: max(speed window, the missed-number delay when “mark after N s” is chosen) + 1 s, and never below the 2 s of the table. The create form and the host's live seconds field refuse a shorter value with a plain message; the server keeps the interval in range as well.
- **Host draws keep the timed pace (D13):** with `host` draws, Draw next stays locked until the moment the next number would have been drawn under timed draws — the match's interval since the round's last draw (so never shorter than D12). The button shows the remaining seconds. The server refuses a draw that comes too early. The round's first draw is not locked.
- Every drawn number is shown with its column letter (e.g. “G 52”); a drawn season symbol is shown as its icon.

## 6. Marking modes

| Mode | Behaviour | Default for |
|---|---|---|
| `auto` | The server marks every drawn number on every card instantly. | Asynchronous |
| `manual` | The player taps the cell. A tap within `speedWindowMs` (default 3000 ms) after the draw becomes visible earns a **speed bonus**. What happens to a drawn number the player has not tapped is the match's **missed-number rule** below. | Realtime |

**Missed-number rule.** Whoever starts a match chooses one rule for all players of that match:

- `autoMarkAfter` with a delay in seconds (default 3, at least the speed window): a drawn number the player has not tapped is marked for them, without bonus, when the delay has passed.
- `noAutoMark`: a missed number stays open; the player may still tap it until the round ends, without bonus. When the round ends, open numbers stay unmarked.

In both rules the speed bonus is earned only by a tap inside the speed window. Patterns, season activations and Season Complete count only from marked cells: under `noAutoMark` an untapped number does not count until it is tapped. A tap on an undrawn number is always rejected by the server, so there is nothing to gain by cheating a mark.

The rule applies to human players. Bots (only in the Quick Test, 15 WP-08) always mark on the draw.

## 7. Battle royale structure

### 7.1 Match template

A match follows a **match template** from the ruleset — an ordered list of stages:

```yaml
# example default template "royale-100"
stages:
  - kind: qualification
    rounds: 2
    cutAfterStage: { keep: percent, value: 50 }
  - kind: elimination
    rounds: 2
    cutAfterEachRound: { keep: percent, value: 50 }
  - kind: final
    rounds: 1
    winCondition: firstFullHouse
```

With 100 starters: 100 → 50 after qualification → 25 → 13 (rounded up) → final.

**Pause between rounds (D14):** whoever creates a royale match chooses what happens after a round and its cut: “wait N seconds” (default 6, at least 3), after which the next round starts on its own, or “the host starts the next round”. With the host option the host console shows **Start next round** during the pause, players read “Waiting for the host to start round N”, and the server starts the next round only on the host's command.

**Interlude between royale rounds (D20):** the pause after a royale round and its cut shows an interlude: a recap of the round just played. The server builds it from the match's own events and sends it to every viewer (players, eliminated players, spectators, the host): the round's top three by points scored in that round; the biggest climber (most places gained in the standings during the round, ties by points in the round); the players out in this cut (how many, up to 8 names) and those the Winter shield saved; who completed all four seasons in the round; the fastest tapper (lowest average time from a draw to the player's own tap, over at least 5 taps inside the speed window; left out if nobody qualifies); and the round's facts (numbers drawn, players still in). An item with no content is left out. The recap is for fun only: it awards no points, no shields and no effects and changes no ranking. It holds nothing secret (no seed, no undrawn number, no other player's card).

### 7.2 Scoring carry-over

Per stage, `scoreCarry` decides what happens to points when a stage starts: `keep` (cumulative), `reset`, or `scaled` with a factor (default `keep` for qualification→elimination, `reset` for the final). A stage can multiply all points earned in it (`stageMultiplier`, e.g. final ×2) — this is the **progressive scoring**. The royale default rulesets use multiplier 1 in every stage; the multiplier stays configurable per ruleset.

**Stage multiplier (D11, decided 2026-10-21):** every stage of the royale defaults has `stageMultiplier` 1, so a point is worth the same in every stage; a ruleset may still set another factor per stage (0.1–10).

### 7.3 Round-end conditions (one per round)

| Condition | Round ends when … |
|---|---|
| `drawCount` | N numbers have been drawn (default 40). |
| `firstBingo` | Any player completes any active pattern; draws continue for a short `graceDraws` (default 0) so ties on the same draw count. |
| `bingoQuota` | K players have completed a pattern (e.g. 10 % of active players). |
| `firstFullHouse` | Any player marks the whole card. |
| `poolExhausted` | Always applies as the upper bound. |

### 7.4 Cuts (elimination)

- `keep: percent | count | scoreThreshold`.
- A percentage keeps the number of survivors rounded up (D18): 50 % of 25 keeps 13, 33 % of 10 keeps 4.
- Ranking for the cut uses the tie-break chain in §8.4.
- Minimum survivors: `max(cut result, minSurvivors)` (default 2).
- If the active field is already at or below the final size, remaining elimination stages are skipped.
- **Winter shield** (§8.2) can save a player from a cut.

### 7.5 Final

- Final win conditions: `firstFullHouse` (default), `highestScore` after N draws, or `firstPattern`.
- The final always produces a complete placement list: winner = 1st, others by score/tie-break. Eliminated players are placed by elimination order, then by score at elimination.

### 7.6 Match size and lobby

| Setting | Default |
|---|---|
| `minPlayers` to start | 2 (the ruleset's `lobby.minPlayers`; Start and the automatic start both read it, decided 2026-10-23) |
| `maxPlayers` per match | 200 |
| Lobby open before start | 10 min (realtime) / 24 h (async) |
| Late join | Allowed until the end of round 1 of the first stage (async: until first cut); a late joiner starts with 0 points. |
| Start rule | chosen at creation: the host starts it (default), at a set time (at least a minute and at most a week ahead), or when every place is taken; a 10-second countdown either way. A set time is an announcement (D16): the host can always start the match with “Start match”, before or after that time. “Start automatically at the start time” (default off) is set at creation and can be switched on and off in the console until the match starts. With it on, the match starts itself at the start time if at least `minPlayers` players have joined (the 10-second countdown begins at that time); with fewer it neither starts nor stops: it waits, and the console says “Not enough players at the start time — start it yourself or abort”. (`either` is not offered yet.) |
| Registration status | the same line for the host (console) and players (waiting room, lobby card): no start time → “Registration open until the host starts the match”; a set time → “Starts at 22:25 (in 12 min)” (with the day when it is not today), counting down live, followed by “starts automatically” or “the host starts it” (D16); start when full → “N places left”. “Starting…” appears only during the real 10-second countdown. |

## 8. Scoring and seasons

### 8.1 Base points (defaults)

| Event | Points |
|---|---|
| Mark | 10 |
| Speed bonus (manual mode, inside window) | up to 10, linear decay over the window |
| Line (row / column / diagonal) | 100 |
| Four corners | 100 |
| X pattern | 250 |
| Full house | 500 |
| Custom pattern | set per pattern |
| First player to complete a pattern in the round | +50 % of the pattern value |
| Season Complete | 300 + event (§8.3) |

A pattern scores once per card per round.

### 8.2 Season effects

A season activates the moment its season cell is marked. Each season is bound to one **effect type** from a fixed catalog; the admin chooses the type and its parameters per ruleset. New effect *types* require code; everything else is configuration.

| Effect type | Parameters | Meaning |
|---|---|---|
| `addPoints` | `points` | Instant points. |
| `multiplier` | `factor`, `durationDraws` | All points earned in the next N draws × factor. |
| `growth` | `pointsPerMark`, `durationDraws` | Each further mark in the next N draws earns an extra, increasing amount (+1×, +2×, +3× …). |
| `harvest` | `scope` (row/column/card), `pointsPerMarked` | Instantly scores every already-marked cell in the scope. |
| `shield` | `rankMargin`, `charges` | At the next cut, if the player would be eliminated but is within `rankMargin` places of the cut line, the player survives instead. Consumes one charge. |
| `revealNext` | `count` | Shows the player the next N numbers that will **not** be on their card (pure information; never reveals numbers that are). |

Defaults (matching the theme in the brief):

| Season | Default effect | Default parameters |
|---|---|---|
| Spring — growth | `growth` | 2 points per mark, 10 draws |
| Summer — score boost | `multiplier` | ×1.5, 8 draws |
| Autumn — harvest | `harvest` | row of the season cell, 15 points per marked cell |
| Winter — control / defense | `shield` | margin 3 places, 1 charge |

Rules:
- Effects of the same type do not stack; a second activation refreshes the duration.
- Different effect types stack; multipliers apply after growth.
- Shield charges persist across rounds within the match; they expire at the end of the match.

### 8.3 Season Complete

- Triggers when a player has activated all four seasons **within the same match** (cells may be marked across different rounds).
- Grants `seasonComplete.points` (default 300) and one **Season Complete event**: a broadcast announcement to the match, a badge on the player’s profile, and a counter on the leaderboard.
- Optional `seasonComplete.effect` (any effect type from §8.2) — default none.
- Counts once per player per match.

### 8.4 Ranking and tie-breaks

Within a round, stage or match, players are ordered by:
1. Points (higher first)
2. Number of completed patterns
3. Seasons activated
4. Draw index of the player’s last scoring event (earlier first)
5. Join timestamp (earlier first) — deterministic last resort

### 8.5 Seasonal jackpot

A **points** jackpot (never money):
- Starts at `jackpot.base` (default 1000) per match and grows by `jackpot.growthPerRound` (default 250) each round in which nobody claims it.
- Claimed by the first player who completes **Season Complete together with a full house in the same round**.
- Unclaimed jackpot at match end is dropped (no rollover between matches by default; `jackpot.rollover` can enable it per match series).

## 9. Fairness and verifiability

- Each match has a server-generated 256-bit secret seed. At match open the server publishes `sha256(seed)` (the **commitment**).
- Cards, season-cell positions and draw order for every round are derived deterministically from the seed (HMAC-SHA256 counter DRBG with domain separation per round and purpose).
- After the match ends the seed is published. Anyone can recompute all cards and draws and verify the commitment. The match page offers a **“Verify this match”** download (seed + ruleset version + participant card IDs).
- As built (NIGHT-6): `GET /api/v1/matches/:code/verify` reveals the seed once the match has finished or was cancelled (409 before), and the server recomputes every round's draw order, every draw and every card from it with the domain's `verifyMatch`; the page "Verify this match" (`#/verify/<code>`, linked from the final screen and the cancelled page) shows the commitment, the seed, the result per round and offers the data as JSON. The seed never travels in a socket frame or state answer.
- Admins cannot see the seed of a running match (it is stored encrypted with a key the admin UI never decrypts; see [03-security-architecture.md](03-security-architecture.md) §9).
- Changing configuration never affects a running match: the match is frozen to its ruleset version.

## 10. Leaderboards and profiles

| Board | Period | Ranks by |
|---|---|---|
| Season board | One calendar quarter, named after the season (configurable period) | League points |
| All-time board | Forever | League points |
| Match board | One match | Placement |

**League points** per match: `placementPoints[place]` from a configurable table (default: 1st 100, 2nd 70, 3rd 50, 4–10 25, 11–25 10, finalists +10, everyone who finishes the match 2). Rank on the season board = sum of league points; tie-break: wins, then Season Completes.

Only matches with the `countsForLeaderboard` flag on contribute to league
points (§3a.3). The flag defaults to on for `royale` and off for the classic
types, and can be flipped per match before start.

Leaderboard integrity rules are in [03-security-architecture.md](03-security-architecture.md) §11.

Profile shows: display name, avatar (from the list of built-in avatars or the identity provider), matches played, wins, best placement, Season Completes, badges. No real names, no e-mail address shown publicly.

## 11. Realtime vs. asynchronous — what differs

Everything is the same engine. Only these ruleset values differ by default:

| Aspect | Realtime | Asynchronous |
|---|---|---|
| Draw interval | 5 s | 15 min |
| Draw control (§5) | `auto` or `host`, switchable during the match | `auto` or `host`, switchable during the match |
| Marking | manual + speed bonus | auto |
| Lobby window | 10 min | 24 h |
| Notifications | in-app only | in-app + optional e-mail digest / web push |
| Return experience | live view | “While you were away” summary: draws, marks, season activations, rank changes, cuts survived |

## 12. Chat in the game

- One chat room per match (all participants and spectators), plus a global lobby room.
- Eliminated players keep chat access.
- Full requirements: [06-realtime-architecture.md](06-realtime-architecture.md) §7 and [03-security-architecture.md](03-security-architecture.md) §12.

## 12a. Live call

A match may be linked to a Seasonal Entertainment website call. The link shows
an embedded call view of the website next to the match; the website's rules for
the call are unchanged. The game stores only the call reference
(`matches.host_call_ref`, 04 §3.3), never audio or video. A linked call is
offered only in combination with a match; it is not a standalone product of this
game. The embeddable call view itself is a separate website task (see
BACKLOG; website: embeddable call view).

## 13. Visual and audio design

- Brand: the four Seasonal Tokens seasons and their original icons; the season colours shared with the Seasonal Entertainment website (Spring `#afb84e`, Summer `#e06e22`, Autumn `#f9a825`, Winter `#04aaf7`); font Luxora Grotesk. Assets and their origin: [assets/README.md](../../assets/README.md).
- The Seasonal Entertainment website's look (its SE style, same token names and values): light and dark, both meeting WCAG AA. Light is a warm off-white page, dark a night-blue one, each under four soft glows of the token colours; cards are translucent so the glow shows; buttons are pills (primary solid, secondary glass); headings in Luxora Grotesk Bold (700). The top bar shows the website's round emblem beside the “Seasonal Bingo Royale” wordmark, and a light/dark toggle. Theme logic as on the website: a stored choice (`se.theme`) wins, otherwise the system setting, followed live; the theme is set before the first paint by an external script (the CSP forbids inline scripts) and `color-scheme` follows it.
- Signed out, the top bar offers “Sign in” and “Register”: register with a display name (3–24 letters or digits), an e-mail and a password of at least 12 characters; every refusal reads as a sentence (wrong e-mail or password — the same answer for an unknown e-mail —, name or e-mail in use, weak or common password, too many tries).
- After Create match, and in the console while the match is in the lobby: “Your match is open — players can join now from the lobby (code XXXXXX).”
- Cards show the letters B I N G O above the columns, with each column's numbers ascending (§4). The draw ticker, banners and announcements show every number with its letter (“G 52”) and every season symbol as its icon (§5).
- Key moments get a distinct animation and sound: draw, mark, pattern, season activation (per-season colour burst), Season Complete (four-colour sequence), cut (“You're through — next round in N s” / “You're out in cut N — you can keep watching”), final win.
- Every event line (banners, the match log) is plain English, never an internal reason, event or prize key: “Round 1 over — all 40 numbers drawn”, “Round 5 over — bot-14 filled the whole card”, “bot-16 collected all four seasons”, “Cut 1: 12 go on, 8 are out (2 saved by Winter shield)”, “Full card won by bot-02 on draw 37 (G 52)”. Server error codes reach the screen as sentences too.
- One match log per screen, newest first, hidden while empty.
- Standings and the final placement are ranked rows: rank, name, the four season icons with the collected ones lit (royale), points; the viewer's own row highlighted; eliminated players dimmed with “out” below a divider. The final screen states the viewer's place big (“You finished #9 of 20”), then a podium for places 1–3 in season colours, then the list. An eliminated player's status panel reads “Out in cut N” instead of effects and shield.
- The cut screen comes into view when a cut happens; its button reads “Keep playing” for a survivor and “Watch” for an eliminated player (D15). At the end of a match the final placement (with one line on how places are decided) replaces the live standings, the in-play wording goes (“Match over”), and the screen offers “Back to the lobby” (the host also “Host another match”).
- A match ended without a result (cancelled by its host or by the system) shows its own end page to host and players (D17): the title, “This match was cancelled by the host.” or “… by the system.”, the reason in plain words, “Back to the lobby” for everyone and “Host another match” for the host. The live arena (“Waiting for the first number”, empty standings) is never shown for an ended match; the lobby lists a cancelled match as “Cancelled” with a link to that page.
- The match header's progress line names the stage, round and draw during a round (“Battle royale · stage 1 (qualification) · round 1 · draw 12”); in the pause after a round it names the ended round with its own stage (“… · round 1 over”) and, once the next stage has begun, that stage as next (“… · stage 2 (elimination) next”). Every dropdown option of the create form is fully readable on a 390 px phone; options leave out what their legend already says (“Draws” → “Timed (every 5 seconds)”).
- The host's draw mode is a segmented switch (“Host draws” / “Timed draws”, the active one filled and checked); the seconds field shows for timed draws only, Draw next for host draws only. Draw next keeps 4.5:1 contrast enabled and disabled. The host console shows the same progress line (stage, round, draw) and LIVE badge as the players, with the match log above the standings.
- A classicSeasons symbol shows its icon on the card colour, framed in its season colour; a drawn symbol shows its icon and its name (“Winter”). The lobby lists open and running matches and, for a day after their end, finished ones (“Finished”, opening their result) and cancelled ones (“Cancelled”, opening their end page, D17), newest first.
- The top bar is sticky from 640 px wide; on phones it scrolls away with the page, the theme toggle sits beside the brand, and the account row wraps rather than cutting the account chip. With a mouse the page column keeps its width whether or not a scrollbar shows.
- All animations respect `prefers-reduced-motion`; all sounds are off by default and toggleable.
- Accessibility target: WCAG 2.2 AA — numbers readable at 200 % zoom, colour is never the only carrier of meaning (season icons have shapes), full keyboard play in manual mode.

## 14. Out of scope for v1

- Anything with monetary value: purchases, wagers, payouts, token transfers, wallets.
- Native mobile apps (the web client is responsive and installable as a PWA).
- Player-created private matches with custom rules (admins and organizers create matches).
- Languages other than English.
