# 07 — Integration Architecture

> Part of the Seasonal Bingo Royale specification. Index: [README](README.md).

## 1. Goals

- **Standalone:** own accounts, own login, own database. Works with zero external services.
- **Integrated:** users of an existing website (first target: the Seasonal Entertainment website) play without a second account, and the game can be placed on that website’s pages with minimal effort.
- Both at the same time: an installation can accept local accounts **and** one or more external identity providers. Each is switched on/off in the admin panel (`integrations` settings).

## 2. Identity adapters (port `IdentityProvider`)

| Adapter | Protocol | When to use |
|---|---|---|
| `local` | Own e-mail/password + TOTP | Standalone |
| `oidc` | OpenID Connect, Authorization Code + PKCE (S256), `state` + `nonce`, discovery document | Host site is (or has) an OIDC provider — preferred |
| `jwt-handoff` | Host signs a short-lived JWT for a logged-in user; the game exchanges it once | Host site has its own login but no OIDC provider (a later option, not built) |
| `proxy-header` | The host's reverse proxy asks the host site who the visitor is (nginx `auth_request` / Caddy `forward_auth`) and passes the answer as request headers to one game route (§2.3) | Game served under the host's own domain behind the host's proxy — **the Seasonal Entertainment website (D37)** |

`oidc` and `jwt-handoff` are described as later options for other host sites; neither is built. Built: `local` (standalone) and `proxy-header` (website installs, D37). An installation runs in one of two modes (`SBR_AUTH_MODE`): `local` (default) or `website`; in `website` mode the game's own registration, password sign-in and development sign-in are off (§2.3).

OAuth2 is covered through OIDC (OIDC is OAuth2 + identity). Plain OAuth2 providers without OIDC (e.g. Discord) can be added later as an `oauth2-userinfo` adapter; not in v1.

### 2.1 Account linking rules

- External identities link by `(issuer, sub)` only.
- First login via an external identity creates a local account **without** password (`email` stored only if the provider marks it verified).
- Linking an external identity to an existing local account requires the user to be logged in to both (explicit link flow from the profile page). No silent linking by e-mail — prevents account takeover through a provider that does not verify e-mails.
- Display name: taken from the configured claim; on collision a numeric suffix is added and the user can change it.
- Roles: an optional `role_mapping` maps provider claims/groups to game roles (e.g. host group `organizers` → `organizer`). Mapped roles are marked `source=idp_mapping` and recomputed at every login (losing the claim removes the role); `super_admin` and `security_admin` can **never** be granted by mapping — they stay with `sbr admin create-super` and server commands (D41, 2026-11-03).

### 2.2 JWT handoff contract

Host backend creates (never the host’s browser JavaScript):

```jsonc
// header
{ "alg": "EdDSA", "kid": "host-2026-10", "typ": "JWT" }
// claims
{ "iss": "https://seasonal-entertainment.example", "aud": "seasonal-bingo-royale",
  "sub": "user-123", "name": "Walter", "picture": "https://…/a.png",
  "roles": ["member"], "iat": 1760900000, "exp": 1760900060, "jti": "01J…" }
```

- Lifetime ≤ 60 s, single use (`jti` replay cache), audience fixed.
- Delivered either as `POST /api/v1/auth/handoff` from the host page (iframe `postMessage` → game iframe posts it) or as a one-time redirect `https://bingo.example/auth/handoff#token=…` (fragment, never query string, so it is not logged).
- The game answers with a first-party session cookie (same-site deployment) or an in-memory embed token (third-party context).

### 2.3 Proxy header contract (D37)

The pattern of the website's event-bot admin page (`/bot-admin/`, website repository `server/src/bots/adminAuthorizeRoutes.js` and `docs/AUTH.md`): the game never sees a password or a website session; the website's proxy asks the website and forwards only the answer.

```
browser ──GET /games/bingo/auth/website?next=…──► website proxy (nginx / Caddy)
                                                    │ auth_request / forward_auth:
                                                    │ GET <authorize endpoint> with the browser's Cookie
                                                    ▼
                                                  website ── 2xx + X-Acting-User-* headers (or 401/403)
                                                    │
         proxy clears any client-sent X-Acting-User-* and X-Sbr-Proxy-Secret,
         copies the answer's headers, adds X-Sbr-Proxy-Secret ──► game app
         (refused: 302 to <base>/auth/website/login?next=… ──► game app ──► website login)
```

- **One route reads identity headers:** `GET <base>/auth/website` (inside the website: `/games/bingo/auth/website`). The proxy protects exactly this route; every other path of the game is proxied without asking the website and without those headers.
- **Headers** (names configurable, defaults matching the website's answer of 2026-11-04): for a member in good standing `X-Acting-User-Id` (the website's user id, never reused; an opaque string to the game), `X-Acting-User` (username), `X-Acting-User-Roles` (comma-separated: `member`, `organiser`, `admin`), `X-Acting-User-Email-Verified` (`true` for every account in good standing), `X-Acting-User-Can-Host` (`true`/`false`: the website's permission "may start games") and `X-Acting-User-Steps` (the member's Discord steps: base64url of compact JSON, at most three `{ ladder: holder|farmer|investor, name, icon }`, each the highest step, the icon a site-relative path or null; `[]` without Discord or steps). Anyone else (signed out, locked, required 2FA not set up) gets `204` with only `X-Acting-Guest: true`; an older website answered 401/403. The authorize call carries the browser's `Cookie`, `Origin`, `Host` and `X-Original-Method`. The steps header is checked strictly (`@sbr/contracts` `parseSteps`: at most 2 KB, at most three entries, a known ladder, a name of at most 40 characters, an icon with one leading "/" or null); anything else counts as no steps, is logged once, and the sign-in goes on. The steps are kept per account as last seen at sign-in and shown next to the name (standings, results, waiting room, leaderboard, profile), the icon loaded from the website's own origin.
- **Trust:** the game accepts them only on that route, only in `website` mode, only from a peer address in `SBR_TRUSTED_PROXIES`, and only when the request carries the proxy secret in `X-Sbr-Proxy-Secret` (`SBR_WEBSITE_PROXY_SECRET`, generated by the installer, kept in `/etc/sbr/<env>.env` and the game's route file, both 0600; compared in constant time). Anywhere else they are ignored (no other code reads them); a local process on a trusted address without the secret signs nobody in (403). The proxy route file clears client-sent `X-Acting-User*` and `X-Sbr-Proxy-Secret` headers before it adds the website's answer, and sets the secret only after the authorize call, so the website never sees it.
- **Account:** found or created by `(issuer, subject)` = (the site origin, `X-Acting-User-Id`) per §2.1: no password, no e-mail stored. The display name follows the website at each sign-in (a numeric suffix on collision, §2.1). Roles are mapped and recomputed at every sign-in (`source=idp_mapping`): `X-Acting-User-Can-Host: true` → `organizer` (may host; D46, 2026-11-04, replaces D40: the website role no longer decides hosting); `admin` → `game_admin` (a game admin, who may host too; D41); every account keeps `player`; `super_admin` and `security_admin` are never granted by mapping (§2.1). `X-Acting-User-Email-Verified: true` sets the account's e-mail as verified for league points (03 §11), `false` clears it. A website id the website deleted (§2.4) is refused.
- **Guests (D47, 2026-11-04):** on the sign-in route a guest answer (`X-Acting-Guest: true`) or no valid identity goes on to `<base>/auth/website/login` with the same `next`, the browser's game session untouched. A visitor without a game session watches: the client takes a watch-only guest session (the guest role: `match.watch`), so the lobby, running matches (spectator view, D24), results, Verify, the leaderboard and profiles are readable; Join and the account page send a visitor without an account to `<base>/auth/website/login?next=<this page>`. Every write without an account is refused on the server (401, or 403 from the CSRF check or a missing right), whatever the client shows.
- **Session:** the route starts the game's own session (03 §3, rotated) and redirects to `next` (D43): a same-origin path under the base path in printable ASCII, without a scheme, host, `//` or backslash; anything else goes to the base path (the lobby). The client's sign-in button goes to this route with the page it shows as `next`. The website's login sits in front: when the authorize endpoint refuses (not signed in), the proxy redirects to `<base>/auth/website/login` with the same query; the game answers 302 to `SBR_WEBSITE_LOGIN_PATH` (default `/login?next=`) followed by the URL-encoded `<base>/auth/website?next=<URL-encoded page>`, so after signing in the visitor comes back through the route to the page they wanted (D43, 2026-11-03).
- **Deleting the account:** a website account has no password; it is deleted by typing its display name to confirm (`DELETE /me { displayName }`, D42). Everything else of account deletion is unchanged (03 §19).
- **Session end (D49):** a game session started by the website sign-in lasts at most 7 days (absolute; idle 7 days; admin sessions 8 hours / 30 minutes; standalone unchanged: 30 days / 7 days idle). A change on the website (deleted, locked, unlocked, rights) ends all the player's game sessions within one poll of the account-changes feed (§2.4); the next action signs in through the website again. A suspended game account is refused by the route (403).

### 2.4 Account-changes feed (website mode, D49)

The website lists account changes at `GET http://site:3800/api/games/bingo/account-changes?since=<cursor>` with the header `X-Games-Sync-Token` (64 hex characters; the installer copies `/etc/seasonal/games-sync-token` into the game's root-only env file at install and `sbr update`; never printed, logged, shown in `sbr status` or put into backups). Answer: `{"changes":[{"id":42,"kind":"locked"}],"next":"118"}`; `id` a number, compared as `String(id)` with the stored website id; kinds `deleted`, `locked`, `unlocked`, `rights`; at most 500 per answer; `since` digits only, absent or `0` from the beginning; `next` unchanged while nothing is new; 401 wrong token, 400 bad cursor, 404 switched off.

- **Reaching it:** the app joins the website's Docker network in both modes (own Caddy: the network of its Caddy; nginx: of its `site` container) and calls `http://site:3800`. In nginx mode that network is not trusted for the sign-in route (only the edge subnet is).
- **Polling** (`apps/server/src/website/accountFeed.ts`): every 2 minutes, following `next` until a page brings no changes (at most 20 pages a poll); the cursor is kept as a string in `sbr.website_feed`. Unknown kinds are logged once and treated like `rights`; ids not linked to a game account are skipped. A failing feed (network, 401, 404) is retried at the next poll and shown in `sbr status`; play goes on. Without the token file the feed stays idle, with a warning.
- **Each change** (`apps/server/src/website/accountChanges.ts`): every kind revokes all the account's sessions at once and closes its sockets (the existing revoke and the gateway's per-session disconnect); a player in a running match keeps card and results and returns after signing in again; a locked account gets the guest answer and stays a guest. `deleted` also deletes the game account through the existing path (03 §19): it becomes "deleted player" plus its fixed four-character tag (D51) in past rounds and match histories, its points stay there, it leaves the leaderboard, its name and steps are gone, the event log is never rewritten; its website id is kept in `sbr.website_deleted`, so a later sign-in with it is refused. What the game keeps per player: [docs/PRIVACY-DATA.md](../PRIVACY-DATA.md).
- **Standalone installs** keep `local` mode unchanged: the route answers 404, registration and password sign-in work as before.

## 3. Embedding

### 3.1 Embed modes

| Mode | How | Recommended for |
|---|---|---|
| **Same-site iframe** | Game on a subdomain of the host (e.g. `bingo.seasonal-entertainment.tld`), host page includes `<iframe src="https://bingo…/embed/…">` | The Seasonal Entertainment website — cookies are first-party-ish (same site), simplest and most robust |
| **Third-party iframe** | Game on an unrelated domain | Other community sites; uses the token flow because browsers block third-party cookies |
| **Link-out** | Host links to the game; game uses OIDC/handoff to sign in | Any site, zero code |

### 3.2 Embed loader

A tiny script `embed.js` (served by the game, ~3 KB, no dependencies) that host pages include:

```html
<div data-sbr-embed data-view="match" data-match="K7Q2M"></div>
<script src="https://bingo.example/embed.js" async></script>
```

Views: `lobby`, `match`, `leaderboard`, `profile`. The loader creates the iframe with `sandbox="allow-scripts allow-same-origin allow-popups allow-forms"`, `allow="autoplay; fullscreen"`, auto-resizes it via `postMessage` height events, and exposes an optional JS API for the host page.

### 3.3 postMessage protocol

- Every message: `{ source: "sbr", v: 1, type, payload }`.
- Game iframe accepts messages only from origins in `embed_origins`; host loader accepts only from the game origin. `targetOrigin` is always explicit, never `*`.
- Messages: `sbr:ready`, `sbr:resize {height}`, `sbr:auth:request` (game asks host for a handoff token), `sbr:auth:token {jwt}` (host answers), `sbr:auth:logout`, `sbr:navigate {view, params}`, `sbr:event {kind}` (e.g. match finished, for host-side notifications).

### 3.4 Embed allowlist

- Admin-managed list of allowed origins (`embed_origins`): embedding works only on sites an admin approved (decision D4, 2026-10-19).
- The list drives `Content-Security-Policy: frame-ancestors`, the postMessage origin check, WS `Origin` check, and CORS for `/auth/handoff` and `/auth/embed/refresh`.

## 4. Seasonal Entertainment integration (first target)

Facts from the website concept (owner, Oct 2026): one login for website and games; separate member and organizer areas; certain website users may start games; Telegram and Discord are linked on the website for roles and identity.

Mapping into this game:

| Website concept | Game |
|---|---|
| Website login | `proxy-header` (D37, §2.3): the website's proxy answers who the visitor is; players sign in only through the website login |
| Members | role `player` |
| Organisers | role `organizer` (may host), mapped at every sign-in |
| Website admins | **not** mapped to any game admin role; game admins are assigned inside the game |
| Telegram/Discord linkage | stays on the website; the game receives only the resulting identity and roles |
| Website pages | the game at `https://<site domain>/games/bingo`; the games page links to it |

**D37 (2026-11-02, replaces D3):** the website has its own server-side sessions and no OpenID Connect provider (checked 2026-10-19), and its proxy already authorizes the event bot's admin page with `auth_request`. The game uses the same delivery:

- The game is served at `/games/bingo` on the website's domain (the website's rule for games, 2026-10-17). Its own cookie is scoped to `Path=/games/bingo` and does not collide with the website's `__Host-se.sid`.
- The website provides an authorize endpoint (default path `/api/games/bingo/authorize`, configurable in the game's installer) that answers a signed-in, unlocked user with 2xx and the four headers of §2.3, anyone else with 401/403; the game's installer writes the proxy route that calls it for `/games/bingo/auth/website` only.
- The proxy route file is the game's own (nginx: a location file the website includes with one line; the website's own-Caddy mode: `routes/bingo.caddy` with `forward_auth`), never an edit of the website's files (09 §3).
- **D38 (2026-11-02):** the game goes online on the owner's VPS only once this works end to end.
- `jwt-handoff` (§2.2) and `oidc` stay described for other host sites; neither is built.

## 5. Notifications into the host

Optional outbound **webhooks** (feature flag `integrations.webhooks`, default off): signed (`HMAC-SHA256`, header `X-SBR-Signature`, timestamp + 5 min tolerance) POSTs to admin-configured HTTPS URLs for `match.scheduled`, `match.started`, `match.finished`, `season.complete`. Delivered through the SSRF-safe client with retries (3, exponential). The website can use these to post into its Telegram/Discord channels.

## 6. Chat in integrated mode

The game has no chat of its own (D55, 2026-11-06). On the Seasonal Entertainment website the website's chat room is the only chat (decision D5, [README](README.md) §4); a standalone install has no chat.

- Room slug `bingo` in the website chat, embedded through the website's `/embed/chat?room=bingo&theme=<light|dark|auto>` in a frame on pages under `/games/bingo/` (same site, so the website login applies; see the website's `docs/EMBED.md`). Not built yet: the website creates the room when Bingo is switched on (website task SE-EMBEDDED-GAMES); its report gives the final slug and URL.
- Game announcements (Season Complete, cuts, winner) stay in the game's own announcement strip, not posted into the website chat.

## 6a. Live call

A match may be linked to a Seasonal Entertainment website call (01 §12a). The
match stores a call reference in `matches.host_call_ref`; the client renders the
call next to the match by embedding the website's call view at that reference,
using the website's own rules unchanged.

- The embeddable call view is a separate website task (BACKLOG, website:
  embeddable call view). Until the website delivers it, the field is accepted
  and stored, but the match client renders no call panel.
- The game never streams or stores audio or video.
- A standalone "join a call" without a match is not offered by this game.
- Admin link flow: the match-create and match-edit forms (11 §3.2) carry an
  optional `hostCallRef` input.

## 7. Public read API for hosts

Unauthenticated, cacheable (60 s), CORS-enabled for allowlisted origins:
- `GET /api/v1/public/matches/upcoming`
- `GET /api/v1/public/leaderboards/current?limit=10`
- `GET /api/v1/public/matches/:code/result`

Enough for a website widget (“Next Bingo Royale at 20:00 · Top 10 this season”) without an iframe.

**As built: open sign-ups for the website (D50, 2026-11-05).** `GET <base>api/public/open-rounds` (standalone `https://<bingo domain>/api/public/open-rounds`, embedded `https://<site domain>/games/bingo/api/public/open-rounds`) answers the contract shared with the website, word for word in [docs/OPEN-ROUNDS.md](../OPEN-ROUNDS.md): no login, `Cache-Control: public, max-age=30`, at most 60 requests a minute per address, at most 20 rounds whose sign-up is open now (in the lobby, no start countdown running, an asynchronous lobby window not closed) and whose host ticked "Show on the Seasonal Entertainment website" (create form, or the host console's lobby until the countdown; website mode only, off by default). Test matches (the fast test profile) and matches with bots are never listed; no player names. `joinUrl` is the match's lobby page on the endpoint's own origin (`<public address>#/match/<code>`). In a standalone install the option does not exist, so the list is empty. The website's proxy lets the path through like every other game path (it asks the website only on the sign-in route). The three planned routes above are not built.
