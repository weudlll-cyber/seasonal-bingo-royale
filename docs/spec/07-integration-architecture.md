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
| `jwt-handoff` | Host signs a short-lived JWT for a logged-in user; the game exchanges it once | Host site has its own login but no OIDC provider; simplest integration |

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
| Website login | `oidc` (if the website exposes an OIDC provider) or `jwt-handoff` (otherwise) |
| Members | role `player` |
| Organizers / users allowed to start games | role `organizer` via `role_mapping` |
| Website admins | **not** mapped automatically to `game_admin`/`security_admin`; assigned inside the game |
| Telegram/Discord linkage | stays on the website; the game receives only the resulting identity and roles |
| Website pages | same-site iframe embed via `embed.js` |

The website has its own server-side sessions and embed tokens but no OpenID Connect provider (checked 2026-10-19), so the website uses **`jwt-handoff`** (decision D3, [README](README.md) §4):

- The game is served at `/games/bingo` on the website’s domain (the website’s rule for games, 2026-10-17). Its own cookie is scoped to `Path=/games/bingo` and does not collide with the website’s `__Host-se.sid`.
- When the game page opens and has no game session, it calls a website endpoint (planned: `POST /api/games/bingo/handoff`, website repository) that returns a 60-second EdDSA-signed token for the logged-in website user, with the user’s roles. The game exchanges it at `/api/v1/auth/handoff`.
- The website publishes its public key (JWKS) so the game can verify; key and issuer are entered once in the game’s admin panel.
- The `oidc` adapter stays in v1 for other host sites.

## 5. Notifications into the host

Optional outbound **webhooks** (feature flag `integrations.webhooks`, default off): signed (`HMAC-SHA256`, header `X-SBR-Signature`, timestamp + 5 min tolerance) POSTs to admin-configured HTTPS URLs for `match.scheduled`, `match.started`, `match.finished`, `season.complete`. Delivered through the SSRF-safe client with retries (3, exponential). The website can use these to post into its Telegram/Discord channels.

## 6. Chat in integrated mode

The game ships its own chat (required to work in both modes). On the Seasonal Entertainment website, the game shows **one dedicated room of the website chat** instead (decision D5, [README](README.md) §4):

- Room slug `bingo` in the website chat, embedded through the website’s `/embed/chat?room=bingo&theme=dark` (same site, so the website login applies; see the website’s `docs/EMBED.md`).
- Selected by the setting `integrations.chatProvider`: `builtin` (default, standalone) or `hostEmbed` with `integrations.hostChatUrl`. The chat UI sits behind a `ChatPanel` component boundary, so both are a client-side choice.
- With `hostEmbed`, game announcements (Season Complete, cuts, winner) are shown in the game’s own announcement strip, not posted into the website chat.
- The `bingo` room itself is created by a website admin; nothing in the game creates it.

## 7. Public read API for hosts

Unauthenticated, cacheable (60 s), CORS-enabled for allowlisted origins:
- `GET /api/v1/public/matches/upcoming`
- `GET /api/v1/public/leaderboards/current?limit=10`
- `GET /api/v1/public/matches/:code/result`

Enough for a website widget (“Next Bingo Royale at 20:00 · Top 10 this season”) without an iframe.
