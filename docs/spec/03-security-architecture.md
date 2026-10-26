# 03 — Security Architecture

> Part of the Seasonal Bingo Royale specification. Index: [README](README.md). Threats and their mapping to these controls: [13-threat-model.md](13-threat-model.md).

## 1. Principles

1. **Server authoritative.** The client is a renderer. It sends intents (join, mark, chat); every rule, score, draw and ranking is decided on the server.
2. **Zero trust between components.** Every request is authenticated and authorized on its own — including WebSocket messages, internal admin calls and embedded clients. Network position grants nothing.
3. **Least privilege.** Fine-grained permissions; admin powers split across roles; the app’s DB user cannot alter schema or read audit secrets.
4. **Secure by default.** Every security setting ships with its safe value; the admin can tighten freely but loosening a hardened control needs the `security_admin` role and is audited.
5. **Defense in depth.** Proxy limits, app limits, schema validation, DB constraints.
6. **Nothing of value to steal.** No payments, no wallets, no stake (see [01-game-design.md](01-game-design.md) §1.1). Personal data is minimized to what accounts need.

Alignment target: **OWASP ASVS 5.0 Level 2** for the whole application, Level 3 for authentication, session management and admin functions. The OWASP Top 10 (2021/2025) mapping is in §17.

## 2. Identity and authentication

### 2.1 Standalone (local accounts)

- Registration: e-mail + display name + password. E-mail verification required before playing ranked matches (configurable).
- Passwords: **argon2id** (m=64 MiB, t=3, p=1; parameters stored per hash for upgrades). Minimum length 12, maximum 128, checked against a bundled top-100k breached-password list (offline, no external call). No composition rules.
- Login responses are uniform (“invalid e-mail or password”) and constant-time to prevent account enumeration; registration and password-reset flows also never reveal whether an e-mail exists.
- Known trade-off until e-mail verification is built: registration answers 409 `REGISTRATION_FAILED` when the e-mail **or** the display name is taken. It does not say which, but with a free display name the answer reveals that the e-mail exists. The registration limit (5 an hour per IP, §13) slows probing. With verification, registration will always answer “check your e-mail” and send the notice to the address itself.
- Password reset: single-use token, 32 random bytes, stored as SHA-256 hash, valid 30 minutes, invalidates all sessions on success.
- **2FA (TOTP, RFC 6238)**: optional for players; **mandatory for all admin roles** (setting `security.adminRequire2fa`, default `true`, only `super_admin` can change it). Ten single-use recovery codes, stored hashed.
- Passkeys (WebAuthn) are planned as a later feature flag (`auth.passkeys`), not in v1.

### 2.2 Integrated mode

See [07-integration-architecture.md](07-integration-architecture.md). Summary: OIDC Authorization Code + PKCE, or a signed short-lived JWT handoff from a trusted host site. External identities map to local accounts by `(issuer, subject)`, never by e-mail alone.

### 2.3 Guests

Feature flag `auth.guests` (default on): a guest gets a temporary session to **watch** matches and read chat. Guests cannot join matches, post in chat, or appear on leaderboards.

## 3. Session management

- After login the server creates a session row and sets a cookie:
  `__Host-sbr_session=<opaque 256-bit id>; Path=/; Secure; HttpOnly; SameSite=Lax` when the game runs at the root of its own host, or
  `__Secure-sbr_session=<id>; Path=<base path>; Secure; HttpOnly; SameSite=Lax` when it runs under a base path such as `/games/bingo` on a host site (the `__Host-` prefix requires `Path=/`).
  The DB stores only `sha256(id)`.
- Idle timeout 7 days for players, 30 minutes for admin sessions; absolute lifetime 30 days / 8 hours. A session is an admin session when its account holds `super_admin`, `security_admin`, `game_admin` or `moderator`. Revoked and expired sessions are deleted by the daily retention job.
- Session ID rotates on login, privilege change and 2FA completion.
- Admin actions require a **step-up**: re-entering TOTP if the last 2FA check is older than 10 minutes.
- Users see and revoke their sessions (device, approximate location from IP prefix only, last seen).
- Embedded clients on a foreign site (third-party context) cannot rely on cookies; they use an in-memory access token (§4).

## 4. Tokens and JWT security

JWTs are used in exactly two places:

| Use | Issuer | Lifetime | Storage |
|---|---|---|---|
| Embed access token for third-party contexts | Bingo server | 10 min, refreshed via the host’s `postMessage` handshake | JS memory only, never localStorage |
| Inbound handoff token from a trusted host | Host site | ≤ 60 s | Exchanged once for a session |

Rules (enforced with `jose`):
- Allowed algorithms are pinned per issuer (`EdDSA` or `RS256`/`ES256`); `none` and HMAC with public keys are impossible by construction.
- Verify `iss`, `aud`, `exp`, `nbf`, `iat` (max skew 30 s), and **`jti` single use** (replay cache table with TTL = token lifetime).
- Keys come from the issuer’s JWKS URL (on the admin-managed allowlist, fetched through the SSRF-safe fetcher §10) or a pinned public key; cached, rotated by `kid`.
- The bingo server’s own signing key (Ed25519) rotates every 90 days; old keys stay published for verification until all tokens expire.

## 5. Authorization (RBAC)

### 5.1 Roles

| Role | Purpose |
|---|---|
| `guest` | Watch, read chat. |
| `player` | Play, chat, own profile. |
| `organizer` | Create and run matches from published rulesets; moderate chat in own matches. |
| `moderator` | Chat moderation everywhere, handle reports, mute/temp-mute; ban players from chat. |
| `game_admin` | Edit rulesets, patterns, season effects, leaderboards, branding, notifications, feature flags. |
| `security_admin` | Security settings, rate limits, integrations (OIDC/JWT issuers, embed allowlist), view audit log, account suspension. |
| `super_admin` | Role assignment, 2FA policy, break-glass. Should be 1–2 people. |

### 5.2 Permissions

Roles are bundles of permissions; code checks **permissions**, never role names. Example permissions: `match.create`, `match.abort`, `ruleset.edit`, `ruleset.publish`, `settings.security.edit`, `chat.message.delete`, `chat.user.mute`, `account.suspend`, `role.assign`, `audit.read`.

### 5.3 Privilege separation rules

- No single role holds both `ruleset.publish` and `audit.delete` — **audit entries cannot be deleted by anyone through the app**.
- `role.assign` cannot grant `super_admin` to oneself; granting `super_admin` requires a second `super_admin` approval when two exist (four-eyes), otherwise CLI on the server.
- Admin routes live under `/admin`, served by a separate bundle with a stricter CSP, and every admin API call checks the permission **and** a fresh admin session.
- Break-glass: a server-side CLI (`pnpm --filter server cli`) can create a super admin and reset 2FA; it requires shell access to the host and writes an audit entry.

## 6. Input handling and injection defense

| Threat | Control |
|---|---|
| SQL injection | Parameterized SQL only (`pg` placeholders `$1…`). Raw SQL allowed only in migrations and in a reviewed `sql/` folder with tagged templates. ESLint rule forbids string-concatenated SQL. App DB role has no DDL rights. |
| XSS | React escaping; `dangerouslySetInnerHTML` banned by lint. Chat messages are plain text with a whitelist mini-markup rendered client-side (no HTML from users ever). Strict CSP (§7). Trusted Types enabled in the admin app. |
| Command / path injection | No shell execution from request paths. Upload storage paths are server-generated UUIDs. |
| Deserialization | JSON only, parsed with size limits, then zod-validated; prototype pollution prevented (`Object.create(null)` maps; Fastify’s `onProtoPoisoning: 'error'`). |
| Mass assignment | DTOs are explicit zod objects with `.strict()`; unknown keys are rejected. |
| Open redirect | Post-login redirects only to relative paths or allowlisted origins. |

## 7. Browser security headers

Set by the app (Fastify helmet), checked in CI with a header test:

- `Content-Security-Policy` (player app): `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self' wss://<host>; frame-ancestors <embed allowlist>; base-uri 'none'; form-action 'self'; object-src 'none'`
- Admin app: same, plus `frame-ancestors 'none'` and `require-trusted-types-for 'script'`.
- `Strict-Transport-Security: max-age=63072000; includeSubDomains` (preload optional per operator).
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` denying camera, microphone, geolocation, payment.
- `Cross-Origin-Opener-Policy: same-origin` on the admin app; the player app uses `same-origin-allow-popups` (needed for OIDC popups).

## 8. CSRF

- Session cookies are `SameSite=Lax`.
- Every state-changing HTTP request additionally requires the header `X-CSRF-Token`, a per-session token returned by `GET /api/v1/session` (synchronizer token, compared constant-time). The calls that create the first session (register, login, guest, and the development-only quick sign-in) have no token yet; they accept only `application/json` bodies, which a cross-site form cannot send.
- WebSocket handshakes verify `Origin` against the configured origin plus the embed allowlist.
- Embedded clients in third-party context use bearer tokens (no cookies) and are therefore not CSRF-exposed.

## 9. Cryptography, secrets, encryption

- **In transit:** TLS 1.2+ (1.3 preferred) terminated at Caddy; HSTS; WebSockets only via `wss://`. Internal hop Caddy → app is on a private Docker network.
- **At rest:**
  - Disk: operators are advised to use an encrypted volume (documented in the operator guide); not enforceable by the app.
  - Field-level: TOTP secrets, OIDC client secrets, match seeds and the bingo signing key are encrypted with **AES-256-GCM** using a data-encryption key wrapped by the master key `SBR_MASTER_KEY`. Each ciphertext stores key ID + nonce for rotation.
  - Backups are encrypted with **age** before leaving the server (§15).
- **Secrets:** only in environment variables loaded from `/etc/sbr/sbr.env` (mode 0600, owner root) or Docker secrets; generated by the install script with a CSPRNG. Never in the repo, the image, logs or the admin UI. `gitleaks` blocks commits containing secrets.
- **Match seeds** are decrypted only inside the draw use case; no API returns them before the match has finished.
- **As built (match secrets at rest):** the seed column `seed_enc` and, inside the stored event log and snapshots, every seed and every round's draw order are sealed with AES-256-GCM under `SBR_SEED_KEY` (event encoding version 2, `apps/server/src/match/codec.ts`); events stored before version 2 keep their plain form, since the log is never rewritten. A key that does not open the stored secrets stops the server at startup. Key IDs and a wrapped data key for rotation are not built yet.

## 10. SSRF prevention

The server makes outbound requests only for: OIDC discovery/JWKS, SMTP, web push, link previews (off by default). All go through one `SafeHttpClient` adapter that:
- allows only `https`, only hosts on the admin-managed allowlist (or the Web Push providers list),
- resolves DNS itself and rejects private, loopback, link-local, multicast and metadata ranges (IPv4 and IPv6, incl. `169.254.169.254`, `fd00::/8`), and re-checks after redirects (max 2 redirects),
- enforces timeouts (5 s), response size limit (1 MiB) and content-type.

Uploaded images are never fetched from URLs — only direct uploads.

## 11. Game integrity, anti-cheat, leaderboard protection

| Attack | Control |
|---|---|
| Client claims a mark on an undrawn number | Server validates every mark against the drawn set and the card; invalid marks are rejected and counted (abuse signal). |
| Client invents score or pattern | Client never sends scores or patterns. The server derives everything. |
| Speed-bonus manipulation (fake timestamps) | Speed is measured with server receive time minus server draw time. Clock data from the client is ignored. |
| Predicting draws | Draws come from the committed per-match seed (CSPRNG 256 bit); not derivable from public data; seed published only after the match. |
| Admin tampering with a running match | Match is frozen to a ruleset version; seed is encrypted and never shown during the match; every admin action on a match (abort, kick) is audited and shown on the public match page (“aborted by staff”). |
| Multi-accounting to farm league points | E-mail verification for ranked play; rate limits on account creation per IP/24 h; same-device/IP heuristics flag (never auto-ban) multiple accounts joining one match; league points only from matches with ≥ `leaderboard.minPlayersForPoints` (default 8) distinct verified players. |
| Collusion / bots | No player-to-player interaction affects others’ scores, so collusion gains little. Bot signals (perfect reaction times across many draws, inhuman tap regularity) feed the abuse score; moderators review. |
| Replay of WS messages | Every client intent carries a per-socket monotonic `seq`; duplicates or out-of-order intents are dropped. Marks are idempotent by `(round, card, cell)`. |
| Leaderboard writes | Only the Leaderboard context writes league entries, only in reaction to `MatchFinished` events, inside the same transaction as the event projection. Manual corrections are a separate permission (`leaderboard.adjust`), require a reason, and appear as visible adjustments. |

## 12. Chat safety

- Plain text only, max 300 characters, URL auto-linking off by default (`chat.allowLinks`).
- Profanity filter: configurable word lists (block / mask / flag) with normalization (case, leetspeak, diacritics, zero-width chars). Lists are editable by `moderator`+.
- Spam control: per-user token bucket (default 5 messages / 10 s, burst 3), duplicate-message detection (same text 3× in 60 s), new-account slow mode (first 24 h), flood detection per room.
- Sanctions: delete message, temporary mute (presets 5 min / 1 h / 24 h / custom), permanent chat ban, account suspension (security_admin). Every sanction has reason, actor, expiry, and is audited.
- Players can report messages; reports enter a moderation queue.
- Room-level slow mode and lock.

## 13. Rate limiting, brute force, DDoS

**Layer 1 – Caddy:** per-IP connection limit and request rate (default 30 req/s burst 60), request body max 1 MiB (uploads route 5 MiB), header timeout 10 s, WebSocket connection cap per IP (default 10).

**Layer 2 – application** (token buckets, keys per IP and per account; settings in admin):

| Route class | Default |
|---|---|
| Login | 5 / 15 min per account+IP, 20 / 15 min per IP; then exponential back-off; CAPTCHA-free by design (no third-party CAPTCHA), uses progressive delay instead |
| Registration | 5 / h per IP |
| Password reset | 3 / h per account, 10 / h per IP |
| General API | 120 / min per session |
| WS intents | marks 4 / s, chat per §12, other 10 / s |

Account lockout is **soft** (delay), never a hard lock that an attacker could use to lock out a victim.

**Layer 3 – operator:** documented option to put Cloudflare (or similar) in front; the app honours `X-Forwarded-For` only from the configured trusted proxy list.

**Abuse detection:** a per-account and per-IP abuse score fed by rejected marks, rate-limit hits, failed logins, reports; thresholds raise moderator alerts and can trigger temporary throttling. No automatic permanent bans.

## 14. File uploads (admin branding only)

- Only `game_admin`+ can upload: logo, season icons, backgrounds, sounds, fonts.
- Accepted: PNG, JPEG, WebP, SVG, WOFF2, OGG/MP3. Max 5 MiB.
- Detection by **magic bytes** (`file-type`), not extension or MIME header.
- Raster images are **re-encoded** with `sharp` (strips metadata, kills polyglots), size-capped.
- SVG: sanitized with DOMPurify (SVG profile, no scripts, no foreign objects, no external references) and served with `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'` and `Content-Disposition: inline`.
- Stored outside the web root under random UUID names, served by the app with explicit `Content-Type` and `nosniff`.
- Fonts and audio validated by header and size; served from the same origin only.

## 15. Backup, disaster recovery, business continuity

| Item | Target |
|---|---|
| RPO (max data loss) | 24 h for full backups; 15 min with WAL archiving enabled (optional) |
| RTO (max downtime) | 2 h on a fresh VPS using the install script + restore |

- Nightly `pg_dump` (custom format) + uploads directory → tarball → `age`-encrypted with the operator’s public key → kept 14 daily / 8 weekly on the server and **pulled to the operator’s own machine** by a documented script (pull, not push: the server holds no credentials to the operator’s machine).
- Restore drill: `sbr restore --drill <file>` restores a backup into a throw-away container and counts what came back ([09](09-deployment-architecture.md) §6); to be run monthly.
- Running matches survive a process restart (event log). A host failure aborts running realtime matches; on restore, async matches resume from the last event and missed draws are performed in order (with a configurable max catch-up).
- Business continuity: the operator guide lists the minimum steps — new VPS, run install script, restore backup, update DNS.

## 16. Audit logging

- Append-only table `audit_log` (DB trigger blocks UPDATE/DELETE for the app role).
- Logged: login success/failure, 2FA changes, session revocations, role changes, every admin write (before/after diff of settings), match aborts/kicks, sanctions, integration changes, uploads, exports.
- Each entry: time, actor account, actor role set, IP (stored truncated after 30 days), action, target, diff, request ID, hash chain value `h_n = sha256(h_{n-1} || entry)` for tamper evidence.
- Retention: 1 year (configurable, min 90 days). Exportable as JSON lines by `security_admin`.

## 17. OWASP Top 10 mapping

| Category | Primary controls (section) |
|---|---|
| A01 Broken Access Control | Permission checks per route & WS message (5), deny by default, admin isolation (5.3) |
| A02 Cryptographic Failures | TLS, argon2id, AES-GCM field encryption, key rotation (9) |
| A03 Injection | Parameterized SQL, zod validation, CSP (6, 7) |
| A04 Insecure Design | Threat model (13-threat-model), server-authoritative engine (11) |
| A05 Security Misconfiguration | Secure defaults, headers test in CI, hardened container (7, 08-devops) |
| A06 Vulnerable Components | Dependency scanning, Renovate, SBOM (18) |
| A07 Identification & Auth Failures | Rate limits, 2FA, session rotation, breached-password check (2, 3, 13) |
| A08 Software & Data Integrity Failures | Signed images, pinned actions, lockfile, commitment scheme (9, 18, 01 §9) |
| A09 Logging & Monitoring Failures | Audit log, alerts, metrics (16, 08-devops) |
| A10 SSRF | SafeHttpClient (10) |

## 18. Supply chain and vulnerability management

- `pnpm` with committed lockfile; `pnpm install --frozen-lockfile` in CI and images. `minimumReleaseAge` / Renovate stability days = 3 for new versions.
- Renovate (or Dependabot) weekly; security updates immediately.
- CI gates: `pnpm audit --prod` (high+ fails), `osv-scanner`, CodeQL, gitleaks, Trivy image scan (critical/high fails), license check (deny GPL-incompatible with the project license).
- CycloneDX SBOM attached to every release; container images signed with **cosign** (keyless, GitHub OIDC) and the install script verifies the signature before running a new image.
- GitHub Actions pinned by full commit SHA; workflow permissions `contents: read` by default.
- Vulnerability handling: `SECURITY.md` with a private reporting channel (GitHub private vulnerability reporting); triage within 7 days; fix critical within 7 days, high within 30.

## 19. Privacy (GDPR baseline)

- Data collected: e-mail, display name, password hash, optional avatar choice, game history, chat messages, IP addresses (security only).
- Chat messages retained 90 days (configurable), then deleted; sanctioned messages kept with the sanction record for its lifetime.
- Account deletion: self-service; personal data erased, match results kept under an anonymous placeholder name so others’ placements stay correct.
- Data export: self-service JSON download.
- No third-party trackers, no ads, no external fonts or CDNs at runtime.
