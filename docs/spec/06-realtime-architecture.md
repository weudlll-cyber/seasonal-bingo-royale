# 06 — Realtime Architecture

> Part of the Seasonal Bingo Royale specification. Index: [README](README.md).

## 1. Transport

- **Socket.IO 4** over WebSocket only (`transports: ['websocket']`; long-polling fallback disabled to keep the security surface small — can be re-enabled by flag `realtime.allowPolling`).
- One endpoint: `wss://<host>/ws`. Namespace `/play` for players/guests, `/admin` for the live admin dashboard.
- Connection state recovery enabled (`maxDisconnectionDuration` 2 min): short drops replay missed packets automatically. Longer drops reload via `GET /matches/:code/state`.
- Max payload 16 KiB per frame; ping interval 20 s, timeout 20 s.

## 2. Handshake and auth

1. Client opens the socket with credentials: cookie (first-party) or `auth: { token }` (embed bearer).
2. Server middleware verifies the session/token, checks `Origin` against the allowed origin list (own origin + `embed_origins`), checks account status and global chat/account sanctions, and attaches `socket.data.principal = { accountId, permissions, sessionId }`.
3. Session revocation and role changes publish `SessionRevoked` / `PermissionsChanged` on the event bus; the gateway disconnects or updates affected sockets immediately. Built: every socket joins the room `session:<id>`; logout, a new sign-in (which revokes the old session) and account deletion disconnect that session's sockets; a recovered connection runs the session check again (`skipMiddlewares: false`). Every host intent (`draw.next`, `round.next`, `draw.setMode`) re-reads the session by its id with the same checks as every HTTP call (revoked, expired, idle-expired, account no longer active; permissions from the current role assignments), so a session that expired while the socket stayed open answers `UNAUTHORIZED` and the socket closes, and a host who lost `match.manage` gets `FORBIDDEN` at once. Role-change events follow with the admin app.
4. A socket may be in at most 3 match rooms at once (watching several async matches).

## 3. Rooms

| Room | Members | Receives |
|---|---|---|
| `match:<id>` | everyone watching the match | draws, round/stage changes, standings deltas, announcements, chat |
| `match:<id>:player:<accountId>` | that player’s sockets (multiple tabs/devices) | own score changes, own effects, mark confirmations, shield usage |
| `chat:<roomId>` | room participants | chat messages, moderation events |
| `lobby` | everyone on the lobby screen | match list changes, global chat |
| `admin:dashboard` | admin sockets with `admin.view` | metrics ticks, alerts |

## 4. Message protocol

All messages are typed in `packages/contracts/ws/*` (zod). Envelope:

```ts
// client → server (intent)
{ t: "mark", seq: 42, data: { roundId, cardId, cell } }
// server → client (event)
{ t: "draw", s: 1835, data: { roundId, index, number, at } }
```

- `seq` (client) is per socket, strictly increasing; duplicates/out-of-order intents are dropped (replay protection).
- On the wire (as built, PERF-FANOUT 2026-11-04): intents are emitted as the Socket.IO event `intent` with `{ t, seq, data }` and an acknowledgement. Committed match events go out **once per step** (§8): one room frame `events` to `match:<id>` and then one `own` frame to every socket in that room, shapes in `packages/contracts/src/view/liveFrames.ts`. The room frame is `{ s, since, events: [{ s, at, event }], match, view }`: the public event projection (seed removed, round starts without cards or draw order, display names from the match's own entries: a deleted account shows as "deleted player" with a short tag, never its account id), the summary without `youHost` (`match`), and `view` with the players still in in order (`rankedIn`) — each of these two left out when it equals what the room got in its previous step (PERF-TAPS) — the recap of a pause (`recaps`, null outside one) and, only in a step that changes them, the stage baselines, the cut facts and the player list (no cards). The own frame is `{ s, me, status?, cards?, card?, watch }`: who the viewer plays as, their effect timeline from entry `from` on, their own cards of the step's round starts, their first-round card when the list comes, and the watched cards (D24) or null for a player still in. Record changes (status, start time, draw control) still come as `match`. The client applies a room frame together with its own frame (`@sbr/contracts` liveHeld `applyStep`) and folds the view with the same playback logic as the Quick Test.
- `s` (server) is the match `event seq`; clients detect gaps (`s` jumps) and resync by calling the state endpoint.
- Intents use Socket.IO acknowledgements: `{ ok: true, data }` or `{ ok: false, code }` with codes from the error catalogue.

### 4.1 Client → server intents

| `t` | Data | Notes |
|---|---|---|
| `match.watch` | `{ code }` | Join `match:<id>` room (permission: public match or participant). Returns state snapshot seq. |
| `match.unwatch` | `{ code }` | |
| `match.follow` | `{ code, follow }` | A watcher of that match (a player out or a spectator, D24) picks the player its frames' watched cards follow, or the top 4 again with `null`; `NOT_WATCHING` for a match the socket does not watch |
| `mark` | `{ code, cardIndex, cell }` (planned: `{ roundId, cardId, cell }`) | Manual mode only; rejected with `MARK_REJECTED`. Accepted until the round ends: a tap inside the speed window earns the bonus, a later tap (possible under `noAutoMark`, 01 §6) marks without bonus. The speed window runs from the draw to the tap's arrival at the server; taps waiting in the match's queue are applied together in one batch (one transaction, one frame; each answered on its own), so 200 tapping players do not hold up the draws (load check of 2026-11-04). Rate limit 4/s. |
| `chat.send` | `{ roomId, body, clientMsgId }` | Rate-limited per §7; `clientMsgId` for dedupe |
| `chat.typing` | `{ roomId }` | Optional, throttled 1 / 3 s; flag `chat.typingIndicator` |
| `presence.ping` | `{}` | Updates `last_seen` for async summaries |
| `draw.next` | `{ code }` | Host draw control (01 §5); permission `match.manage`; rejected with `DRAW_MODE_AUTO` unless the match is in `host` mode and with `DRAW_TOO_EARLY` before the timed interval since the last draw has passed (01 §5, D13); rate limit 2/s |
| `round.next` | `{ code }` | The host starts the next royale round while the match waits for it (01 §7.1, D14), or ends a timed pause early (D21): `nextRoundScheduled` at that moment, then `roundStarted` for everyone; the scheduled `start_round` is replaced, not doubled. Permission `match.manage`, the match's creator only; rejected with `NOT_WAITING_FOR_HOST` outside a pause between rounds |
| `draw.setMode` | `{ code, mode, intervalMs? }` | Switch between `auto` and `host` or change the `auto` interval while the match runs; permission `match.manage`; `intervalMs` within the ruleset's allowed range; never changes the draw sequence |

Built in the first draft: `match.watch`, `match.unwatch`, `match.follow` (2026-11-04), `mark`, `draw.next`, `round.next`, `draw.setMode`; an unknown `t` answers `UNKNOWN_INTENT`, a repeated or out-of-order `seq` `REPLAYED`, a fourth watched match `TOO_MANY_ROOMS`. `chat.*` and `presence.ping` follow with chat (WP-17) and asynchronous matches (WP-14).

### 4.2 Server → client events

Planned message set; the first draft sends the committed events as `events` frames and record changes as `match` frames (§4), which the client folds into the same screens.

| `t` | Room | Data |
|---|---|---|
| `match.lobby` | match | player count, starts at, players joined/left (batched 1/s) |
| `match.started` | match | stage plan |
| `round.started` | match | round meta; own cards are sent on the player room as `round.cards` |
| `draw` | match | `{ roundId, index, number, at, speedWindowEndsAt? }` |
| `draw.modeChanged` | match | `{ mode, intervalMs? }` after `draw.setMode`; `auto` resumes with the next draw due one interval after the change |
| `mark.confirmed` | player | `{ cardId, cell, points, speedBonus }` |
| `score.update` | player | own score, rank, effects |
| `season.activated` | player (+ match announcement if configured) | season, effect summary |
| `season.complete` | match | display name, points (announcement) |
| `pattern.completed` | player; first-in-round goes to match | pattern id, points |
| `standings.delta` | match | changed ranks only (top 50 + changed rows), max 2 per second |
| `round.ended` | match | end reason, round summary |
| `cut.applied` | match + player | survivors count; to player: survived/eliminated, shield used |
| `jackpot.update` / `jackpot.claimed` | match | points, claimant |
| `match.finished` | match | final placements (top 50), link to verification |
| `match.aborted` | match | reason |
| `chat.message` / `chat.deleted` / `chat.sanction` | chat | message or moderation info |
| `notify` | player | in-app notification |
| `resync` | any | server requests the client to reload state |

## 5. Event flow for one draw

In `auto` draw mode the scheduler issues `DrawNext` at `due_at`; in `host` mode no draw is scheduled and the host's `draw.next` intent issues the same command. Both paths draw the next item of the seeded sequence.

```
scheduler due_at ─► DrawNext command ─► domain: decide/evolve
   └─► transaction: append events, update projections (cards auto-marked, standings), schedule next draw
        └─► after commit: event bus ─► WS gateway
              ├─ emit `draw` to match room (1 frame)
              ├─ emit `score.update` / `mark.confirmed` to affected player rooms (auto mode)
              └─ emit `standings.delta` (throttled)
```

Fan-out budget at 200 players: 1 broadcast + ≤ 200 small player frames per draw → well under 1 ms of CPU each; target end-to-end p95 from `due_at` to client receive < 500 ms.

Manual mode marks:
```
client `mark` ─► gateway validate schema+rate ─► MarkCell use case
  validate: player active, card owned, round running, number drawn, not marked
  insert marks row (PK idempotent) ─► compute points (speed bonus from server times)
  ─► ack + `mark.confirmed`; aggregate score folded at next draw
```

Missed numbers (01 §6): under `autoMarkAfter` the scheduler issues `AutoMarkMissed` for each draw once its delay has passed and marks the still-open cells without bonus; under `noAutoMark` nothing is scheduled and open cells stay open until tapped or the round ends.

Round end (01 §5): the scheduler issues `CloseSpeedWindow` when the speed window of each draw closes, then checks `EndRound`; a round never ends at the moment of a draw, so the last number can still be tapped inside its window. Classic prizes are decided at that window close (01 §3a.1).

## 6. Asynchronous mode

- Same engine; draws are scheduled minutes or hours apart, marking is automatic.
- No socket needed: when a player opens the match, the client fetches `state` and `away-summary`.
- **Away summary** = events since `match_entries.last_seen_event_seq`, condensed: number of draws, marks, patterns, seasons activated, rank before → now, cuts survived/eliminated, Season Complete, jackpot changes.
- Notifications: only inside the game, a marker in My matches for a match with news since the player last looked (D54, 2026-11-06); no e-mail digest and no Web Push for now. Never one notification per draw.
- Catch-up after downtime: missed draws are executed in order with `catchUpInterval` (default 2 s) up to `maxCatchUpDraws` (default 75), then normal cadence resumes; affected players get one summary.
- **As built (WP-14, first draft):** the defaults are `ASYNC_CATCH_UP` in `packages/contracts` (a server setting, not part of a ruleset). Each timed draw carries its planned time through its window close (`plannedAt` in the scheduled action's payload); when the next planned time has already passed, the next draw comes at the catch-up pace — in practice every 3 s, since a draw never comes before the previous draw's speed window has closed (D10) — and draws planned more than 75 intervals ago are dropped. No catch-up draw falls inside quiet hours (01 §5). There is no `presence.ping` yet: the away summary is acknowledged by its own fetch (`GET /matches/:code/away-summary`, 05 §2.3a), which the player screen makes on opening, when the page is hidden (what was on screen counts as seen) and when it is shown again. The summary leaves out jackpot changes.

## 7. Chat

None in the game (D55, 2026-11-06): on the website its chat room is the only chat ([07-integration-architecture.md](07-integration-architecture.md) §6); a standalone install has no chat. The chat pipeline once planned here (rooms, filters, moderation, history) is not built and not planned.

## 8. Backpressure and limits

| Limit | Default |
|---|---|
| Sockets per account | 5 |
| Sockets per IP | 10 (Caddy also limits) |
| Intents per socket | 10/s overall |
| Standings broadcasts | ≤ 2/s per match, deltas only |
| Lobby updates | batched 1/s |
| Slow client | if Socket.IO buffer > 1 MiB, socket is disconnected; client resyncs on reconnect |

**One live update per step (PERF-FANOUT, 2026-11-04).** The engine's published events wait up to 40 ms, so a draw, its window close and a batch of taps that come together are one step. Then, one match at a time, the server extends its one replay per match (shared with the state endpoint) with those events, without reading the log; builds the room frame once and broadcasts it; and sends each socket in the room its own frame. The watched cards without a followed player are built once per step for all watchers. Screens apply both frames without a request. The state fetch (`state?since=`) remains only for the first load, a (re)connect (the whole view) and a gap: a step whose `since` is not the seq the screen holds, or an own timeline that starts after what it holds, fetches the events after the held seq once. The step runs on a timer, never in the match's command queue: a tap is acknowledged when its batch is stored, never after the screens are updated. A round start reaches each screen with only that viewer's own cards and without the round's draw order; the recap of D20 comes in the room frames of the pause, built once per round from the shared replay's events and the stored own taps (a restarted server rebuilds the same recap). The rule that keeps frames and fetches the same: applied after every step, the held view equals a full state answer at the same seq. The equivalence test checks this over a whole royale and a classic match (`apps/server/test/liveSteps.integration.test.ts`); the player list's live points, seasons and shield are the exception, coming only with the list (a join, the first round, the finish), and the screens fold them from the events. Measured in 12 §5.

**Unchanged parts left out (PERF-TAPS, 2026-11-04).** The server keeps, per match, the summary and the standings order (`rankedIn`) the room last got. A room frame whose summary or `rankedIn` equals it leaves that field out, and the screen keeps what it holds (`applyStep`). A screen that holds the step's `since` holds those values: it got them from the previous step, or from a fetch at that seq, which computes them from the same state (a fetch made later can only hold newer ones, and the server compares with what it sent, so a changed value always goes out). A gap or a (re)connect still fetches in full. Draws change the summary every step (`nextDrawAt`), so the summary is left out mostly in the steps of a batch of taps; `rankedIn` is left out whenever the order of the players still in stays. The equivalence test makes the player tap after each draw as a step of its own and checks that both fields were left out in some steps and carried in others.

Every state fetch also names the players still in, best first by the tie-break chain (`rankedIn`, 01 §8.4); the live standings order players with equal points by it, so the screen never breaks a tie its own way.

Watched cards (D24): a player who is out of the match, or a spectator (anyone who is not a player still in), gets a `watch` block in every own frame and every state answer: the 4 best-ranked players still in, per watched player the patterns one number away (“1 to go”), and the compact card layouts of the current round (one number per cell). A watcher chooses the player it follows with the intent `match.follow` `{ code, follow }` (null for the top again); a state fetch may still name it with `follow=<name>` and the layouts it holds with `known=<round>:<name>,…`. Marks need no message of their own: they are the public `cellMarked` events every screen already folds. Players still in never receive another player's card, and the block never holds a seed, a draw order or an undrawn number; the authorization case of the equivalence test checks every frame a player still in received. The cut facts (each eliminated player's points at that moment and how far below the line a shield save was, D23) come, like the player list, only in a step with a cut.

**As built (audit-3 S4, 2026-11-06):** the Engine.IO handshake already refuses a foreign Origin (the game's own origin, `SBR_PUBLIC_URL`'s; in website mode the site's, which is the same), before any upgrade. At most `SBR_SOCKETS_PER_ADDRESS` (50, generous on purpose: many players can share one address at an event) open sockets per client address — the address behind the proxies the app trusts (`SBR_TRUSTED_PROXIES`, as Fastify reads it) — and `SBR_SOCKETS_PER_SESSION` (5) per session; the load check's temporary accounts (`match.loadcheck`) are not counted per address, so `sbr loadcheck` opens its sockets from one machine without lowering the default. Refusals are counted (`sbr_ws_refused_total{reason=origin|address|session}`) and logged at most once per address a minute; the client sees `TOO_MANY_SOCKETS`.

## 9. Scale-out (step 1 in [02-software-architecture.md](02-software-architecture.md) §8)

- `@socket.io/redis-adapter` for cross-instance room broadcasts.
- Sticky sessions at Caddy (`lb_policy cookie`).
- Event bus switches to Redis pub/sub; match command execution guarded by the `scheduled_actions` lease so exactly one instance runs a match’s commands.

## 10. Observability

Metrics: connected sockets (by namespace), intents/s by type, rejected intents by code, draw latency (`due_at` → emit), emit fan-out time, reconnects/min, resyncs/min, chat messages/min, filtered/blocked counts.
