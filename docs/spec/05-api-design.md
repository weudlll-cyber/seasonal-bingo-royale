# 05 — API Design

> Part of the Seasonal Bingo Royale specification. Index: [README](README.md). Realtime messages: [06-realtime-architecture.md](06-realtime-architecture.md).

## 1. Conventions

- Base path `/api/v1`. Admin API under `/api/v1/admin` (separate router, admin session required).
- JSON only, UTF-8. Request and response bodies are defined as zod schemas in `packages/contracts/http/*` — the server validates with them and the clients type against them. An **OpenAPI 3.1** document is generated from those schemas at build time (`zod-to-openapi`) and served at `/api/v1/openapi.json` (admin only in production).
- Errors: RFC 9457 `application/problem+json` with `type`, `title`, `status`, `code` (stable machine code, e.g. `MATCH_FULL`), `detail`, `requestId`. Never stack traces.
- Pagination: cursor based — `?limit=50&cursor=<opaque>`, response `{ items, nextCursor }`.
- Idempotency: POSTs that create things accept `Idempotency-Key` (UUID); repeated keys within 24 h return the original result.
- Auth: session cookie (+ `X-CSRF-Token` on writes) or `Authorization: Bearer <embed token>`.
- Rate-limit headers: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` (IETF draft), `Retry-After` on 429.
- Versioning: breaking change ⇒ `/api/v2`; v1 stays for at least one release.

Commands (state change) and queries (read) are separate handlers in `application/` — routes map 1:1 to one use case.

## 2. Public / player endpoints

### 2.1 Session and auth

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/session` | Current session, account summary, permissions, CSRF token, feature flags | any |
| POST | `/auth/register` | Create local account | none, rate-limited |
| POST | `/auth/verify-email` | Confirm e-mail token | none |
| POST | `/auth/login` | E-mail + password → session (or `2FA_REQUIRED` with a short-lived challenge ID) | none |
| POST | `/auth/login/2fa` | Challenge ID + TOTP or recovery code | none |
| POST | `/auth/logout` | End current session | session |
| POST | `/auth/password/forgot` | Request reset mail (always 202) | none |
| POST | `/auth/password/reset` | Token + new password | none |
| POST | `/auth/guest` | Guest session (if enabled) | none |
| POST | `/dev/sign-in` | Development builds only: `{ as }` with `host` or `player-1` … `player-3` signs in as `dev-host` (organizer) or `dev-player-N`, created on first use; absent in production | none |
| DELETE | `/dev/load-accounts` | Development builds only: removes the load check's accounts (`dev-load-NNN`) with their sessions and roles; outside any session, so without a CSRF token; absent in production | none |
| GET | `/auth/oidc/:providerId/start` | Redirect to provider (PKCE, state, nonce) | none |
| GET | `/auth/oidc/:providerId/callback` | Finish OIDC login | none |
| POST | `/auth/handoff` | Exchange host-signed JWT for session or embed token | none |
| POST | `/auth/embed/refresh` | Refresh embed token (bearer) | embed token |
| GET | `/me/sessions` · DELETE `/me/sessions/:id` | List / revoke sessions | session |
| POST | `/me/2fa/setup` · `/me/2fa/confirm` · `/me/2fa/disable` | TOTP management (disable requires current code) | session, step-up |

### 2.2 Profile

| Method | Path | Purpose |
|---|---|---|
| GET | `/me` | Own account + profile |
| PATCH | `/me` | Display name, avatar key, privacy |
| GET | `/me/export` | GDPR export (JSON) |
| DELETE | `/me` | Delete account (requires password or recent re-auth) |
| GET | `/players/:displayName` | Public profile: stats, badges, recent placements |

### 2.3 Matches

| Method | Path | Purpose |
|---|---|---|
| GET | `/matches?status=&mode=&gameType=` | List open/running/finished public matches |
| GET | `/matches/:code` | Match detail: title, game type, mode, status, ruleset summary (public part), stage plan (royale) or prize list (classic types), `countsForLeaderboard`, `hostCallRef`, player count, seed commitment, seed (after finish), `youHost` (the signed-in account created the match and may run it; the same field in every match summary, e.g. the lobby list), `nextRoundAt` (when the next round starts during the pause after a round and its cut, for the countdown on the cut screen; recorded in the event log, so it survives a server restart; null outside that pause), `nextDrawAt` (when Draw next unlocks, D13; null before a round's first draw), `waitingForHost` (the match waits for its host to start the next round, D14), `startsAt` (the end of the running 10-second countdown; null before it runs), `tooFewAtStart` (the automatic start of a set time found fewer than 2 players; the match waits for its host, D16) |
| POST | `/matches/:code/join` | Join lobby (or late join) |
| POST | `/matches/:code/leave` | Leave (before start: removed; after start: forfeit, stays placed by elimination order) |
| GET | `/matches/:code/state` | Full state snapshot for the caller (own cards, standings top 50 + own row, current round, last draws, active effects). Used on load and after reconnect. |
| GET | `/matches/:code/away-summary` | “While you were away” since the caller’s `last_seen_event_seq`; acknowledges on fetch |
| GET | `/matches/:code/standings?cursor=` | Full standings |
| GET | `/matches/:code/replay` | Event stream (public projection) of a finished match |
| GET | `/matches/:code/verify` | Verification bundle (seed, ruleset document, card IDs, draw list) after finish |
| GET | `/me/matches` | Caller’s current and past matches |

Manual marks go over WebSocket (low latency). A fallback `POST /matches/:code/marks` exists for clients without WS; same validation (built with `{ cardIndex, cell }`, §2.3a).

### 2.3a Matches as built (first draft)

The first draft serves these routes (base `/api/v1`, session cookie, `X-CSRF-Token` on every write). The host's routes live under the match for now; the admin-route layout of §3 follows with the admin app (WP-19).

| Method | Path | Body | Who |
|---|---|---|---|
| GET | `/matches` | — | anyone: open and running matches, and those ended in the last day |
| POST | `/matches` | `{ title, gameType, prizes?, drawMode, drawIntervalMs?, missedNumbers, countsForLeaderboard?, maxPlayers, roundPause?, startRule? }`; `prizes` at most 20 keys of 1–32 characters (`PrizeKeySchema`, `MAX_PRIZES` in `packages/contracts`), else 400 `VALIDATION_FAILED` | `match.create` |
| GET | `/matches/:code` | — | anyone: the summary (`youHost`, `minPlayers`, `tooFewAtStart`, `nextDrawAt`, …) |
| GET | `/matches/:code/state?since=` | — | anyone: the view the client folds; a viewer's own cards only; `since` gives a delta; during the pause after a royale round `view.recaps` holds that round's recap (D20, `RoundRecap` in `packages/contracts`), the same for every viewer |
| POST | `/matches/:code/join` | `{}` | `match.join` |
| POST | `/matches/:code/marks` | `{ cardIndex, cell }` | `match.join`: the tap without a socket |
| POST | `/matches/:code/start` | `{}` | the match's host (`match.manage`, created it) |
| POST | `/matches/:code/draw-next` | `{}` | the host |
| POST | `/matches/:code/next-round` | `{}` | the host, while the match waits for them (D14) or during a timed pause, which it ends at once (D21) |
| POST | `/matches/:code/draw-mode` | `{ mode: "auto" \| "host", intervalMs? }` | the host |
| POST | `/matches/:code/auto-start` | `{ auto }` | the host, before the start (D16) |
| POST | `/matches/:code/abort` | `{ reason }` | the host |
| POST | `/matches/:code/bots` · `/matches/:code/dev-system-abort` | `{ upTo }` · `{ reason }` | development builds only |
| DELETE | `/me` | `{ password }` | the signed-in account |
| GET | `/maintenance` | — | anyone: `{ on, reason }` while `sbr maintenance on` is set (09 §4) |
| GET | `/matches/:code/verify` | — | anyone, once the match has finished or was cancelled: the commitment and the revealed seed (hex), the ruleset, per round the numbers drawn and whether the draw order, the draws and the cards follow from the seed (counted, no account ids), and `verified`; before the end 409 `MATCH_NOT_OVER` (01 §9); its own limit of 20 calls a minute per address (429 `RATE_LIMITED`), since one answer recomputes the whole match; the answer of a match that is over never changes, so it is computed once and kept in memory (the newest 500 matches; calls arriving together share one computation) |

Answers are `{ code }` on error (problem+json follows with the contracts work): `VALIDATION_FAILED` (400), `SIGN_IN_REQUIRED` (401), `FORBIDDEN`, `NOT_YOUR_MATCH`, `CSRF_INVALID`, `PASSWORD_REQUIRED` (403), `NOT_FOUND` (404), `MATCH_NOT_IN_LOBBY`, `MATCH_FULL`, `DRAW_MODE_AUTO`, `DRAW_NOT_ALLOWED`, `DRAW_TOO_EARLY`, `NOT_WAITING_FOR_HOST`, `NO_START_TIME`, `MATCH_STARTING`, `MATCH_NOT_OVER` (409), `NOT_ENOUGH_PLAYERS`, `START_TIME_INVALID`, `INVALID_PRIZES`, `MARK_REJECTED` (422), `JSON_REQUIRED` (415), `RATE_LIMITED` (429), `MAINTENANCE` (503, `sbr maintenance on`; the body adds the operator's `reason`, D22).

### 2.4 Leaderboards

| Method | Path | Purpose |
|---|---|---|
| GET | `/leaderboards` | Active and past periods |
| GET | `/leaderboards/:periodId?cursor=` | Entries (rank, display name, points, wins, Season Completes) |
| GET | `/leaderboards/:periodId/me` | Caller’s row and neighbours (±5) |

### 2.5 Chat, notifications, misc

| Method | Path | Purpose |
|---|---|---|
| GET | `/chat/rooms/:roomId/messages?before=` | History (paged) |
| POST | `/chat/messages/:id/report` | Report a message |
| GET | `/notifications` · POST `/notifications/read` | In-app notifications |
| POST | `/push/subscribe` · DELETE `/push/subscribe` | Web Push |
| GET | `/config/public` | Branding, theme tokens, public feature flags, season icon URLs |
| GET | `/assets/:uploadId` | Serve uploaded asset |
| GET | `/healthz` (liveness) · `/readyz` (readiness: DB, migrations) | Ops (no auth, no details) |
| GET | `/metrics` | Prometheus, for scrapers inside the server only: a request that came through a proxy (it carries `X-Forwarded-For`) gets 404 in every install type; the standalone Caddy and the website snippet also answer 404 for the path |

## 3. Admin endpoints (`/api/v1/admin`)

Every route lists its permission. All writes are audited with before/after diff. All writes require admin session + recent 2FA (step-up ≤ 10 min).

| Area | Routes | Permission |
|---|---|---|
| Dashboard | `GET /dashboard` (active matches, players online, error rate, abuse alerts) | `admin.view` |
| Rulesets | `GET/POST /rulesets`, `GET /rulesets/:id/versions`, `POST /rulesets/:id/versions` (new draft from latest), `PUT /ruleset-versions/:id` (edit draft), `POST /ruleset-versions/:id/validate`, `POST /ruleset-versions/:id/simulate`, `POST /ruleset-versions/:id/publish`, `POST /ruleset-versions/:id/retire` | `ruleset.view` / `ruleset.edit` / `ruleset.publish` |
| Patterns | `GET/POST /patterns`, `PUT /patterns/:id`, `POST /patterns/:id/archive` | `ruleset.edit` |
| Matches | `GET /matches`, `POST /matches` (create from published ruleset; body carries `gameType`, `prizes[]` (classic types only), `countsForLeaderboard`, optional `hostCallRef`, `drawMode` (`auto` \| `host`) and `drawIntervalMs` (at least 1 s longer than the longest tap time, D12), `roundPause` (royale: `{ kind: 'wait', ms }` with at least 3 s, default 15 s (D21), or `{ kind: 'host' }`, D14), `startRule` (`{ kind: 'host' }` default, `{ kind: 'at', at, auto }` — an announced time at least the 10 s countdown and at most a week ahead, 422 `START_TIME_INVALID` otherwise; `auto` (default false) starts the match itself then with at least 2 players, D16 —, or `{ kind: 'whenFull' }`, 01 §7.6), `missedNumbers` (`autoMarkAfter` | `noAutoMark`) and `autoMarkDelayMs` (`autoMarkAfter` only, at least the speed window) — see 01 §3a, §5, §6 and 11 §3.2), `PATCH /matches/:id` (title, schedule, prizes and `countsForLeaderboard` while `scheduled`), `POST /matches/:id/start` (always allowed in the lobby with at least 2 players, also before a set time, D16; 409 `MATCH_STARTING` while the countdown runs; 503 `MAINTENANCE` with the reason while maintenance is on, D22), `POST /matches/:id/auto-start` (body `auto`; switches the automatic start of a set time while the match waits to start; 409 `NO_START_TIME` without a set time, D16), `POST /matches/:id/abort`, `POST /matches/:id/kick`, `POST /matches/:id/draw-next` (host draw; 409 `DRAW_MODE_AUTO` unless `drawMode = host`, 409 `DRAW_TOO_EARLY` before the timed interval since the last draw has passed, D13), `POST /matches/:id/next-round` (starts the next royale round when the match waits for its host, D14, or ends a timed pause early: the pause end is recorded as `nextRoundScheduled` at that moment, the round starts for everyone and the pending timed start is dropped, D21; 409 `NOT_WAITING_FOR_HOST` outside a pause between rounds), `PUT /matches/:id/draw-mode` (body `drawMode`, optional `drawIntervalMs`; allowed while the match runs; the draw sequence is unchanged) | `match.create` / `match.manage` / `match.abort` |
| Schedules | `GET/POST /match-series`, `PUT /match-series/:id` (recurring matches, e.g. daily async at 18:00) | `match.create` |
| Leaderboards | `GET/POST /leaderboard-periods`, `POST /leaderboard-periods/:id/close`, `POST /leaderboard-adjustments` | `leaderboard.manage` / `leaderboard.adjust` |
| Settings | `GET /settings/:documentId`, `GET /settings/:documentId/versions`, `PUT /settings/:documentId` (new version), `POST /settings/:documentId/rollback/:version` | per document: `settings.<doc>.edit`; `security`, `rate_limits`, `integrations` need `security_admin` |
| Integrations | `GET/POST/PUT/DELETE /identity-providers`, `POST /identity-providers/:id/test`, `GET/POST/DELETE /embed-origins` | `integration.manage` |
| Accounts | `GET /accounts?query=`, `GET /accounts/:id`, `POST /accounts/:id/suspend`, `POST /accounts/:id/unsuspend`, `POST /accounts/:id/roles`, `DELETE /accounts/:id/roles/:role`, `POST /accounts/:id/sessions/revoke-all` | `account.view` / `account.suspend` / `role.assign` |
| Moderation | `GET /moderation/reports`, `POST /moderation/reports/:id/resolve`, `POST /chat/messages/:id/delete`, `POST /chat/sanctions`, `POST /chat/sanctions/:id/lift`, `PATCH /chat/rooms/:id` (slow mode, lock), `GET/PUT /profanity-lists/:id` | `chat.moderate` |
| Uploads | `POST /uploads` (multipart), `GET /uploads`, `DELETE /uploads/:id` (only if unreferenced) | `branding.edit` |
| Audit | `GET /audit?actor=&action=&from=&to=`, `GET /audit/export` | `audit.read` |
| Abuse | `GET /abuse/alerts`, `POST /abuse/alerts/:id/ack` | `account.view` |

### 3.1 Ruleset simulation

`POST /ruleset-versions/:id/simulate` `{ players: 100, matches: 30, seedBase?: string }` runs the domain engine headless with bot players (auto-mark) and returns: average match duration in draws and minutes, survivors per cut, pattern frequencies, Season Complete rate, jackpot claim rate, score distribution per stage. Runs in a worker thread, time-capped at 20 s, rate-limited. This is how an admin sees the effect of a change before publishing.

## 4. Example payloads

```jsonc
// GET /api/v1/matches/K7Q2M/state  (abridged)
{
  "match": { "code": "K7Q2M", "mode": "realtime", "status": "running",
             "stage": { "index": 1, "kind": "elimination", "roundsTotal": 2 },
             "round": { "id": "…", "index": 0, "drawCount": 17, "endsOn": "drawCount", "endsAt": 40 },
             "seedCommitment": "9f2c…", "jackpotPoints": 1250 },
  "me": { "state": "active", "score": 1840, "rank": 12, "shieldCharges": 1,
          "seasons": { "spring": true, "summer": false, "autumn": true, "winter": false },
          "effects": [{ "type": "multiplier", "factor": 1.5, "remainingDraws": 3 }] },
  "cards": [{ "id": "…", "numbers": [4, 22, 41, 50, 70, …], "seasonCells": [3, 9, 17, 21],
              "marked": "1000100…", "patternsDone": ["row-2"] }],
  "lastDraws": [{ "index": 16, "number": 41, "at": "2026-10-19T20:41:05.120Z" }],
  "standings": { "top": [/* 50 rows */], "me": { "rank": 12, "score": 1840 } },
  "eventSeq": 1834
}
```

```jsonc
// Problem detail
{ "type": "https://errors.sbr/match-full", "title": "Match is full", "status": 409,
  "code": "MATCH_FULL", "requestId": "01J…" }
```

## 5. Error code catalogue (excerpt)

`AUTH_INVALID_CREDENTIALS`, `AUTH_2FA_REQUIRED`, `AUTH_2FA_INVALID`, `AUTH_EMAIL_UNVERIFIED`, `AUTH_SESSION_EXPIRED`, `AUTH_STEP_UP_REQUIRED`, `FORBIDDEN`, `CSRF_INVALID`, `RATE_LIMITED`, `VALIDATION_FAILED` (with `errors[]` path list), `MATCH_NOT_FOUND`, `MATCH_FULL`, `MATCH_NOT_JOINABLE`, `MATCH_ALREADY_JOINED`, `MATCH_PRIZES_REQUIRED` (classic type without a prize ticked), `MATCH_PRIZES_FORBIDDEN` (prizes on a royale match), `MARK_NUMBER_NOT_DRAWN`, `MARK_DUPLICATE`, `RULESET_INVALID`, `RULESET_NOT_DRAFT`, `CONFIG_VERSION_CONFLICT`, `CHAT_MUTED`, `CHAT_BANNED`, `CHAT_FILTERED`, `UPLOAD_TYPE_REJECTED`, `UPLOAD_TOO_LARGE`, `INTEGRATION_UNREACHABLE`.

The full list lives in `packages/contracts/errors.ts`; each code has a one-line description and its HTTP status. Clients map codes to UI strings; never parse `title`.
