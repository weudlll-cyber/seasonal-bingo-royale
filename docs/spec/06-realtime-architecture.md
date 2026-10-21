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
3. Session revocation and role changes publish `SessionRevoked` / `PermissionsChanged` on the event bus; the gateway disconnects or updates affected sockets immediately.
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
- `s` (server) is the match `event seq`; clients detect gaps (`s` jumps) and resync by calling the state endpoint.
- Intents use Socket.IO acknowledgements: `{ ok: true, data }` or `{ ok: false, code }` with codes from the error catalogue.

### 4.1 Client → server intents

| `t` | Data | Notes |
|---|---|---|
| `match.watch` | `{ code }` | Join `match:<id>` room (permission: public match or participant). Returns state snapshot seq. |
| `match.unwatch` | `{ code }` | |
| `mark` | `{ roundId, cardId, cell }` | Manual mode only. Accepted until the round ends: a tap inside the speed window earns the bonus, a later tap (possible under `noAutoMark`, 01 §6) marks without bonus. Rate limit 4/s. |
| `chat.send` | `{ roomId, body, clientMsgId }` | Rate-limited per §7; `clientMsgId` for dedupe |
| `chat.typing` | `{ roomId }` | Optional, throttled 1 / 3 s; flag `chat.typingIndicator` |
| `presence.ping` | `{}` | Updates `last_seen` for async summaries |
| `draw.next` | `{ code }` | Host draw control (01 §5); permission `match.manage`; rejected with `DRAW_MODE_AUTO` unless the match is in `host` mode; rate limit 2/s |
| `draw.setMode` | `{ code, mode, intervalMs? }` | Switch between `auto` and `host` or change the `auto` interval while the match runs; permission `match.manage`; `intervalMs` within the ruleset's allowed range; never changes the draw sequence |

### 4.2 Server → client events

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
- Notifications (opt-in): e-mail digest (daily or per cut), Web Push for “you were eliminated / you survived the cut / final starts / you won”. Never one notification per draw.
- Catch-up after downtime: missed draws are executed in order with `catchUpInterval` (default 2 s) up to `maxCatchUpDraws` (default 75), then normal cadence resumes; affected players get one summary.

## 7. Chat

- Rooms: global lobby room, one per match; match room readable by watchers, writable by participants (incl. eliminated ones) and staff.
- Pipeline for `chat.send`: schema → sanctions check (cached, invalidated on change) → rate/spam check → length → normalization → profanity filter (block → reject `CHAT_FILTERED`; mask → replace with `***`; flag → deliver + queue for review) → persist → broadcast.
- Moderators get inline actions in the client (delete, temp-mute presets, ban) when they hold `chat.moderate`; actions emit `chat.deleted` / `chat.sanction`.
- History: last 50 on join, paged via HTTP.
- In integrated mode the same chat is used (see [07-integration-architecture.md](07-integration-architecture.md) §6 for the option to use the Seasonal Entertainment chat instead).

## 8. Backpressure and limits

| Limit | Default |
|---|---|
| Sockets per account | 5 |
| Sockets per IP | 10 (Caddy also limits) |
| Intents per socket | 10/s overall |
| Standings broadcasts | ≤ 2/s per match, deltas only |
| Lobby updates | batched 1/s |
| Slow client | if Socket.IO buffer > 1 MiB, socket is disconnected; client resyncs on reconnect |

## 9. Scale-out (step 1 in [02-software-architecture.md](02-software-architecture.md) §8)

- `@socket.io/redis-adapter` for cross-instance room broadcasts.
- Sticky sessions at Caddy (`lb_policy cookie`).
- Event bus switches to Redis pub/sub; match command execution guarded by the `scheduled_actions` lease so exactly one instance runs a match’s commands.

## 10. Observability

Metrics: connected sockets (by namespace), intents/s by type, rejected intents by code, draw latency (`due_at` → emit), emit fan-out time, reconnects/min, resyncs/min, chat messages/min, filtered/blocked counts.
