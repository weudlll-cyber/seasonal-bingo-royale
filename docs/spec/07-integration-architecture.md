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
- Roles: an optional `role_mapping` maps provider claims/groups to game roles (e.g. host group `organizers` → `organizer`). Mapped roles are marked `source=idp_mapping` and recomputed at every login; `super_admin` and `security_admin` can **never** be granted by mapping.

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
         proxy clears any client-sent X-Acting-User-*, copies the answer's headers ──► game app
```

- **One route reads identity headers:** `GET <base>/auth/website` (inside the website: `/games/bingo/auth/website`). The proxy protects exactly this route; every other path of the game is proxied without asking the website and without those headers.
- **Headers** (names configurable, defaults matching the website's bot-admin pattern): `X-Acting-User-Id` (stable website user id), `X-Acting-User` (display name), `X-Acting-User-Roles` (comma-separated website roles), `X-Acting-User-Email-Verified` (`true` or `false`).
- **Trust:** the game accepts them only on that route, only in `website` mode, and only from a peer address in `SBR_TRUSTED_PROXIES`; anywhere else they are ignored (no other code reads them). The proxy route file clears client-sent `X-Acting-User*` headers before it adds the website's answer.
- **Account:** found or created by `(issuer, subject)` = (the site origin, `X-Acting-User-Id`) per §2.1: no password, no e-mail stored. The display name follows the website at each sign-in (a numeric suffix on collision, §2.1). Roles are mapped and recomputed at every sign-in (`source=idp_mapping`): `organiser` (or `organizer`) → `organizer` (may host); every account keeps `player`; no admin role is ever granted by mapping. `X-Acting-User-Email-Verified: true` sets the account's e-mail as verified for league points (03 §11), `false` clears it.
- **Session:** the route starts the game's own session (03 §3, rotated) and redirects to `next` (a path under the base path; anything else goes to the base path). The website's login sits in front: when the authorize endpoint refuses (not signed in), the proxy redirects to the website's login with the route as return path, so after signing in the visitor comes straight back. The client's sign-in button goes to this route.
- **Session end:** the game session lasts as configured (03 §3). A website sign-out does not reach the game at once: the game session stays valid until it expires or the player signs out of the game. A deleted or locked website account is refused at its next game sign-in (the authorize endpoint answers 401/403, so the route is never reached); a suspended game account is refused by the route (403).
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

The game ships its own chat (required to work in both modes). On the Seasonal Entertainment website, the game shows **one dedicated room of the website chat** instead (decision D5, [README](README.md) §4):

- Room slug `bingo` in the website chat, embedded through the website’s `/embed/chat?room=bingo&theme=dark` (same site, so the website login applies; see the website’s `docs/EMBED.md`).
- Selected by the setting `integrations.chatProvider`: `builtin` (default, standalone) or `hostEmbed` with `integrations.hostChatUrl`. The chat UI sits behind a `ChatPanel` component boundary, so both are a client-side choice.
- With `hostEmbed`, game announcements (Season Complete, cuts, winner) are shown in the game’s own announcement strip, not posted into the website chat.
- The `bingo` room itself is created by a website admin; nothing in the game creates it.

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
