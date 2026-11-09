# Seasonal Bingo Royale — Specification

Complete blueprint for implementation by Claude Code. The code follows it; what is built and what is open is in [docs/OPEN.md](../OPEN.md) and [docs/BACKLOG.md](../BACKLOG.md).

## 1. Documents

| # | Document | Covers |
|---|---|---|
| 01 | [Game Design](01-game-design.md) | Card, draws, marking, seasons, Season Complete, battle royale stages and cuts, scoring, jackpot, fairness, leaderboards |
| 02 | [Software Architecture](02-software-architecture.md) | Modular monolith, hexagonal layers, bounded contexts, match engine, configuration model, scale path, **technology decisions with rationale** |
| 03 | [Security Architecture](03-security-architecture.md) | AuthN/Z, RBAC, sessions, JWT, CSRF/XSS/SQLi/SSRF, crypto, anti-cheat, chat safety, rate limits, uploads, backup/DR, audit, OWASP mapping, supply chain |
| 04 | [Database Design](04-database-design.md) | PostgreSQL schema, constraints, sizing, migrations, seed |
| 05 | [API Design](05-api-design.md) | REST endpoints (player, admin), errors, pagination, simulator |
| 06 | [Realtime Architecture](06-realtime-architecture.md) | Socket.IO protocol, rooms, draw flow, async mode, chat pipeline, limits |
| 07 | [Integration Architecture](07-integration-architecture.md) | Standalone vs. integrated, OIDC, JWT handoff, embedding, Seasonal Entertainment mapping, webhooks |
| 08 | [DevOps Architecture](08-devops-architecture.md) | Environments, CI/CD, containers, config, observability, patch policy |
| 09 | [Deployment Architecture](09-deployment-architecture.md) | Single-VPS Compose, install script, `sbr` CLI, backups, variants, Kubernetes path |
| 10 | [Repository Structure](10-repository-structure.md) | Folder layout, size rules, file header, review checklist, CLAUDE.md outline |
| 11 | [Admin Panel](11-admin-panel.md) | Screens, configuration catalogue |
| 12 | [Testing Strategy](12-testing-strategy.md) | Pyramid, invariants, E2E journeys, load gate, security tests |
| 13 | [Threat Model](13-threat-model.md) | STRIDE per boundary, residual risks |
| 14 | [Roadmap](14-roadmap.md) | Phases 0–7 with visible outcomes |
| 15 | [Implementation Plan](15-implementation-plan.md) | 30 work packages for Claude Code with acceptance criteria |

## 2. Fixed by the owner (2026-10-19)

- No prizes of monetary value; placements and a leaderboard instead.
- Standalone product that can also be included easily in the Seasonal Entertainment website.
- Sized for up to ~200 concurrent players at launch.
- New repository; all code, specs and repo docs in English.
- Original Seasonal Tokens icons, logo and font come from the Seasonal Entertainment website project ([assets/README.md](../../assets/README.md)).

## 3. Proposals in this spec (built as written unless the owner changes them)

| Proposal | Where |
|---|---|
| Season mechanic: four season cells per card (different rows and columns); marking one activates its effect | 01 §4, §8 |
| Default effects: Spring growth, Summer ×1.5 multiplier, Autumn row harvest, Winter cut shield | 01 §8.2 |
| Default match template 100 → 50 → 25 → 13 → final; points-only jackpot | 01 §7, §8.5 |
| Leaderboard period = one calendar quarter named after the season | 01 §10 |
| Commit-reveal seeds so every match is verifiable afterwards | 01 §9 |
| Stack: TypeScript, Fastify, Socket.IO, **PostgreSQL** (not SQLite, because of the Kubernetes/cloud requirement), React | 02 §9 |
| Mandatory TOTP two-factor for all admin roles | 03 §2.1 |

## 4. Decisions (2026-10-19)

| # | Topic | Decision |
|---|---|---|
| D1 | License | AGPL-3.0-or-later, copyright `weudlll-cyber` (same as the race game and the website). |
| D2 | Original Seasonal Tokens logo and icons | The repository was made public on 2026-10-19 with the Seasonal Tokens icons, logo and font included; the same files are already public in the Seasonal Entertainment website repository. See [assets/README.md](../../assets/README.md). |
| D3 | Login when the game runs on the Seasonal Entertainment website | **Replaced by D37 (2026-11-02).** Was: `jwt-handoff`. Checked against the website repository on 2026-10-19: it has its own server-side sessions and its own embed tokens, but no OpenID Connect provider. The website backend will sign a short-lived handoff token for its logged-in user ([07](07-integration-architecture.md) §4). That endpoint is a separate task in the website repository. |
| D4 | Embedding | Only on sites an admin has approved. |
| D5 | Chat on the website | Inside the website the game shows one dedicated room of the website chat (room slug `bingo`, through the website’s `/embed/chat`). Standalone installations use the game’s own chat ([07](07-integration-architecture.md) §6). |
| D6 | Address | The website already decided (2026-10-17) that games live under its main domain at `/games/<name>`. The game therefore runs at `/games/bingo` on the website’s domain; a subdomain remains possible because the build contains no address and the base path is a setting ([09](09-deployment-architecture.md) §1). |

## 4a. Decisions (2026-10-20)

| # | Topic | Decision |
|---|---|---|
| D7 | Card and ball labels | Every column ascends top to bottom in all game types, under the letters B I N G O; a drawn number shows its letter (“G 52”), a season symbol its season ([01](01-game-design.md) §4, §5). |
| D8 | Draw control | Timed draws or host draws (“Draw next”), switchable at any time during a match; the draw sequence does not change ([01](01-game-design.md) §5). |
| D9 | Missed numbers | When players tap, a drawn number they did not tap is marked for them after N seconds without bonus (default 3), or left open until tapped; chosen at creation ([01](01-game-design.md) §6). |

## 4b. Decisions (2026-10-21)

| # | Topic | Decision |
|---|---|---|
| D10 | Last number and classic prizes | A round's last number stays tappable inside its speed window; a classic prize is decided when the window of the draw that first completes it closes and goes to everyone who has it by then ([01](01-game-design.md) §3a.1, §6). |
| D11 | Royale multiplier | The royale default stages use the stage multiplier 1 ([01](01-game-design.md) §7.2). |
| D12 | Shortest timed-draw interval | 1 s longer than the match's longest tap time (speed window, or the missed-number delay when “mark after N s” is chosen); enforced in the create form, the host's live seconds field and the server ([01](01-game-design.md) §5). |
| D13 | Host draws | Draw next stays locked for the match's timed interval since the last draw and shows the remaining seconds; the server refuses an early draw ([01](01-game-design.md) §5). |
| D14 | Pause between royale rounds | Chosen at creation: wait N seconds (default 15 since D21, minimum 3) or the host starts the next round ([01](01-game-design.md) §7.1). |
| D15 | Cut screen button | “Keep playing” for a survivor, “Watch” for an eliminated player ([01](01-game-design.md) §13). |
| D16 | Start time | A set start time is an announcement; the host can always start the match. “Start automatically at the start time” (default off, switchable in the console until the start) starts it at that time with at least `minPlayers` players (2, D19); with fewer the match waits and the console says so ([01](01-game-design.md) §7.6). |
| D17 | Match ended without a result | Its own end page for host and players: the reason in plain words and who ended it (“by the host” or “by the system”), “Back to the lobby” (everyone) and “Host another match” (host); never the live arena ([01](01-game-design.md) §13). |

## 4c. Decisions (2026-10-23 to 2026-11-01)

| # | Topic | Decision |
|---|---|---|
| D18 | Rounding of a percentage cut (2026-10-24) | A percentage cut rounds the number of survivors up; with the default 50 % a field of 100 goes 100 → 50 → 25 → 13 ([01](01-game-design.md) §7.4). |
| D19 | Players needed to start (2026-10-23) | 2, read from the ruleset's `lobby.minPlayers` by Start and by the automatic start ([01](01-game-design.md) §7.6). |
| D20 | Interlude between royale rounds (2026-10-27) | The pause between two royale rounds shows a recap of the round just played (top three, climber, cut and shield saves, Season Complete, fastest tapper, facts). Fun only: no points, shields or effects, no change to any ranking ([01](01-game-design.md) §7). |
| D21 | Ending a timed pause early (2026-10-29) | The default pause between royale rounds is 15 s (minimum 3 s). During a timed pause the host can start the next round for everyone with one click (“Start next round now”); players' Previous/Next only flip the recap cards on their own screen. “The host starts the next round” (D14) is unchanged ([01](01-game-design.md) §7). |
| D22 | Maintenance holds every start (2026-10-31) | While maintenance is on nothing starts by itself: no automatic start at a set start time and no start when full; such a match waits in its lobby, and when maintenance is turned off a due automatic start runs (or start when full is checked again). The host's Start is refused while maintenance is on (503 `MAINTENANCE`, as when creating a match) with the reason shown. Running matches finish as before ([01](01-game-design.md) §7.6). |
| D23 | The final's fresh start made clear (2026-11-01) | The final keeps its score reset. When the final begins every screen says that all N finalists start at 0 and how the final is won; the standings show “In the final” and “Out of the match” as separate groups, each out row with its cut and the points at that moment ([01](01-game-design.md) §7.2, §7.5, §13). |
| D24 | Live cards for players out and spectators (2026-11-01) | A player who is out and a spectator see the live cards of the best 4 players still in (2 on a phone) with their marks as they happen; selecting a player in the standings shows that card until “Back to the top 4”. Players still in see no other player's card ([01](01-game-design.md) §13, [06](06-realtime-architecture.md) §8, [03](03-security-architecture.md) §11). |
| D25 | The arena's host link (2026-11-01) | “Open host console”, shown in the arena to a host who plays along, opens the host console in a new tab; the player screen stays where it is ([01](01-game-design.md) §13). |
| D26 | Shield saves at a cut (2026-11-01) | Every player within the margin below the line who holds a charge is saved, even if nobody goes out in that cut; no limit ([01](01-game-design.md) §7.4, §8.2). |
| D27 | Seasons of the leaderboard (2026-11-01) | Calendar quarters in UTC: Winter Jan–Mar, Spring Apr–Jun, Summer Jul–Sep, Autumn Oct–Dec ([01](01-game-design.md) §10). |
| D28 | Ties on the boards (2026-11-01) | Players equal on league points, wins and Season Completes share a rank on the boards (standard competition ranking: 1, 2, 2, 4); within the tie they are listed by display name ([01](01-game-design.md) §10). |
| D29 | Bots and the profile (2026-11-01) | The Season Complete badge and the profile figures (matches played, wins, best placement, Season Completes) count only finished matches without bots; matches with bots stay listed under the profile's recent matches with their reason ([01](01-game-design.md) §10). |
| D30 | Quiet hours and the host (2026-11-01) | In an asynchronous match quiet hours apply to the host too: Draw next is refused during them ([01](01-game-design.md) §5). |
| D31 | The asynchronous lobby window (2026-11-01) | The lobby is open 24 h. Then a match not yet started starts by itself with at least `minPlayers` joined (the normal 10-second countdown); with fewer the system cancels it with the reason “Too few players joined within 24 hours” (D17). Maintenance holds this start (D22) ([01](01-game-design.md) §7.6). |
| D32 | What can be asynchronous (2026-11-01) | Only the battle royale ([01](01-game-design.md) §5, §11). |
| D33 | The asynchronous lobby with a start time (2026-11-02) | An asynchronous match with an announced start time keeps its lobby open until that time; then D31's rule applies (start with enough players, else cancelled by the system). Without a start time the lobby closes after 24 h as in D31 ([01](01-game-design.md) §7.6). |
| D34 | When the asynchronous lobby closes (2026-11-02) | The waiting room and the host console of an asynchronous match show “Starts or closes at <time>” in the viewer's time format, live ([01](01-game-design.md) §7.6, §13). |
| D35 | The pause between asynchronous royale rounds (2026-11-02) | Stays 15 s, as in realtime (D21; unchanged) ([01](01-game-design.md) §11). |
| D36 | The whole match log (2026-11-02) | Groups its lines by round without dimming earlier rounds (unchanged) ([01](01-game-design.md) §13). |
| D37 | Website login (2026-11-02, replaces D3) | Inside the Seasonal Entertainment website players sign in **only** through the website login, delivered like the website's event-bot admin page (`/bot-admin/`): the website's proxy (nginx `auth_request`, or Caddy `forward_auth` in the website's own-Caddy mode) asks the website who the visitor is and passes the answer as request headers to one game route; the game never sees a password or a website session. Standalone installs keep the game's own login. Address: `https://<site domain>/games/bingo` ([07](07-integration-architecture.md) §2.3, §4; [03](03-security-architecture.md) §2.2; [09](09-deployment-architecture.md) §3). |
| D38 | Going online (2026-11-02) | The game goes online on the owner's VPS only once D37 works end to end ([09](09-deployment-architecture.md) §1). |
| D39 | Several matches at once (2026-11-02) | A player may be in several matches at the same time (e.g. an asynchronous one and a realtime one), each in its own tab; the lobby shows a signed-in player the list of their own matches that are not over (“My matches”) ([01](01-game-design.md) §11, [05](05-api-design.md) §2.2). |
| D40 | Who hosts in website mode (2026-11-03) | **Replaced by D46 (2026-11-04).** Was: the website roles `organiser` and `admin` may host matches. |
| D41 | Website admins (2026-11-03) | In website mode a website `admin` is a game admin (`game_admin`, recomputed at every website sign-in, so losing the website role removes it). The game's `super_admin` (who grants or removes admins) and `security_admin` are never granted by mapping; `super_admin` stays with `sbr admin create-super` and server commands ([07](07-integration-architecture.md) §2.1, §2.3). |
| D42 | Deleting a website account (2026-11-03) | In website mode a player deletes their game account by typing their display name to confirm (no password); everything else of account deletion is unchanged ([05](05-api-design.md) §2.2; [03](03-security-architecture.md) §19). |
| D43 | Back after the website login (2026-11-03) | After the website login the player returns to the page they wanted to open: `/games/bingo/auth/website?next=<path>` travels through the website login and back; `next` counts only as a same-origin path under the game's base path, anything else goes to the lobby ([07](07-integration-architecture.md) §2.3). |
| — | Accepted as built (2026-11-03) | “Too few players joined by the start time” (D33's cancellation); the “Starts or closes at …” line also on the lobby card (D34); “Waiting for players” under start-when-full and plain “Round 1” before the first cut in My matches (D39); website names with unusable characters get “_”, fewer than 3 usable characters → “player-xxxxxx” (D37). |
| D44 | What the Summer boost multiplies (2026-11-04) | The multiplier effect multiplies the points for marking and the speed bonus during its draws; pattern points and instant points (Autumn harvest, Season Complete) are not multiplied ([01](01-game-design.md) §8.2). |
| D45 | First player to a pattern on one draw (2026-11-04) | When several players complete the same pattern on the same draw, the first-player bonus goes to the one whose completing tap the server received first; when that cannot tell them apart (automatic marking, the missed-number auto-mark, the same receive time) every one of them gets it. Join order no longer decides ([01](01-game-design.md) §8.1). |
| D46 | Who hosts in website mode (2026-11-04, replaces D40) | In website mode hosting needs the website's permission to host this game (`X-Acting-User-Can-Host: true`; per game on the website since 2026-11-09), recomputed at every sign-in; the website role no longer decides it. D41 (website admin = game admin) unchanged. Every website account in good standing counts as confirmed for the leaderboard (`X-Acting-User-Email-Verified: true`) ([07](07-integration-architecture.md) §2.3). |
| D47 | Guests in website mode (2026-11-04) | Guests may watch matches and see the leaderboard without signing in; playing (joining, marking, hosting) needs a signed-in website account; a guest who wants to play is sent to the website login with the sign-in route as return path (D43). The website's proxy asks only on the sign-in route; a visitor without a game session is a guest ([07](07-integration-architecture.md) §2.3). |
| D48 | Discord steps (2026-11-04) | A member's Discord steps (up to three: holder, farmer, investor, each the highest step) show next to their name in the game, as on the website ([07](07-integration-architecture.md) §2.3). |
| D49 | Deleted, renamed and changed website accounts (2026-11-04) | An account deleted on the website becomes a deleted player: its points stay in past rounds and match histories, it leaves the leaderboard, its name and steps are removed, nothing else personal is kept. A renamed account shows its new name from its next sign-in. A change on the website (deleted, locked, unlocked, rights) ends that player's game sessions at once; the next action signs in through the website again. In website mode a game session lives at most 7 days ([07](07-integration-architecture.md) §2.3, §2.4). |
| D50 | Open sign-ups on the website (2026-11-04) | Open sign-ups appear on the website only for rounds the host marked for the website ("Show on the Seasonal Entertainment website", default off) ([07](07-integration-architecture.md) §7). |
| D51 | Deleted accounts' name (2026-11-06, replaces "Deleted player" of D49) | A deleted account shows as "deleted player" plus its fixed four-character tag, as built (`apps/server/src/view/playerNames.ts`), so several stay apart ([07](07-integration-architecture.md) §2.4). |
| D52 | Classic realtime: players still tapping when a prize is decided (2026-11-06) | Settled by D10 as built: a prize is decided when the draw's speed window closes, for everyone who has it by then ([01](01-game-design.md) §7). |
| D53 | No late join (2026-11-06) | Nobody joins a running match, royale or classic, realtime or asynchronous. The ruleset's `lobby.lateJoin` stays in the schema so stored rulesets parse, defaults to `false` and is never read ([01](01-game-design.md) §7). |
| D54 | Asynchronous notifications (2026-11-06) | Only inside the game: a marker in My matches. No e-mail and no Web Push for now ([06](06-realtime-architecture.md) §6). |
| D55 | No chat of the game's own (2026-11-06) | On the website the website's chat room is the only chat (D5); a standalone install has no chat ([07](07-integration-architecture.md) §6). |
| D56 | Sounds (2026-11-06) | Later, at the very end, before or after going live. |
| D57 | Pausing a match (2026-11-06) | No separate pause: the host switches to host draws ("Draw next"), which holds the draws until the host draws again (operator guide, "For hosts"). |
| D58 | Admin app (2026-11-06) | The game's own admin interface (`apps/admin`) comes later, after the move. |
| D59 | League points in standalone installs (2026-11-06) | League points no longer need a confirmed e-mail address; the requirement comes back only with `SBR_FEATURE_EMAIL_VERIFICATION` on. The other protections stay: at least 8 distinct humans, no bots ([01](01-game-design.md) §10, [03](03-security-architecture.md) §1, §11). |
| D60 | Standalone accounts (2026-11-06) | Standalone installs get password reset by e-mail and two-factor sign-in (TOTP) for admin accounts. Website installs keep the website's own sign-in and 2FA ([03](03-security-architecture.md) §1). |
| — | Accepted from audit 3 (2026-11-04) | G5: a match-wide draw counter for “last scoring draw” in ties (01 §8.4). H6: the Quick Test shows the speed bonus the server sent instead of computing it. F1: spec 08 §5 describes the secrets as built, the master key as planned. S3: no CDN in front for now (documented as not supported). S7: unknown request fields are ignored. H7: the 300-line file limit does not apply to test files; the 60-line function limit does (CLAUDE.md, [10](10-repository-structure.md)). |

## 5. Open

The open questions and work are listed in [docs/OPEN.md](../OPEN.md) (short) and [docs/BACKLOG.md](../BACKLOG.md) (full). Needed from the website repository: the authorize endpoint with the four headers, the include line for the game's route file and a login page that returns to `next` (D37, D43), the link on the games page; later the `bingo` chat room (D5) and the embeddable call view.
