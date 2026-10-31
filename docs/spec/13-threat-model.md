# 13 — Threat Model

> Part of the Seasonal Bingo Royale specification. Index: [README](README.md). Method: STRIDE per trust boundary, rated by likelihood (L) and impact (I) on a 1–3 scale. Controls reference [03-security-architecture.md](03-security-architecture.md) (§ numbers).

## 1. Assets

| Asset | Why it matters |
|---|---|
| Accounts & sessions | Takeover = impersonation in chat, ruined leaderboard standing |
| Admin accounts | Full control of rules, players, integrations |
| Match integrity (seed, draws, scores) | The game is worthless if results can be manipulated |
| Leaderboards | Public reputation of players |
| Chat | Harassment, spam, illegal content risk for the operator |
| Personal data (e-mail, IP) | GDPR obligations |
| Secrets (master key, signing key, OIDC secrets) | Compromise breaks all of the above |
| Availability | Live events with an audience |

Not an asset: money. There is none in the system (by design).

## 2. Trust boundaries

1. Browser ↔ Caddy (internet)
2. Host website ↔ embedded game (postMessage, handoff)
3. Caddy ↔ app (internal network)
4. App ↔ Postgres
5. App ↔ external services (OIDC/JWKS, SMTP, Web Push, webhooks)
6. Operator shell ↔ server
7. CI/CD ↔ image registry ↔ server

## 3. Actors

Anonymous internet user · guest · player · cheating player · spammer/troll · malicious host site · compromised moderator/admin · operator · supply-chain attacker.

## 4. Threats

| # | Boundary | STRIDE | Threat | L | I | Controls |
|---|---|---|---|---|---|---|
| T1 | 1 | S | Credential stuffing / brute force on login | 3 | 2 | Rate limits + back-off, breached-password check, 2FA (§2, §13) |
| T2 | 1 | S | Session theft via XSS | 2 | 3 | HttpOnly cookies, strict CSP, no HTML from users, Trusted Types in admin (§3, §6, §7) |
| T3 | 1 | T | Client sends forged marks/scores | 3 | 2 | Server-authoritative validation, client sends intents only (§11) |
| T4 | 1 | I | Predicting draws to gain advantage | 1 | 3 | CSPRNG seed, commit-reveal, seed encrypted at rest (§9, §11) |
| T5 | 1 | T | Speed-bonus cheating with fake timestamps or bots | 2 | 1 | Server-side timing, bot heuristics, small bonus size (§11) |
| T6 | 1 | E | Multi-accounting to farm league points | 2 | 2 | E-mail verification, signup limits, min distinct players for points, heuristics (§11) |
| T7 | 1 | D | Connection/request flood, WS flood | 2 | 3 | Caddy limits, app limits, socket caps, optional Cloudflare (§13); "Verify this match" computed once per match that is over and cached (05 §2.3) |
| T8 | 1 | T | CSRF on state-changing endpoints | 2 | 2 | SameSite + synchronizer token, Origin check on WS (§8) |
| T9 | 1 | R | Moderator/admin denies an action | 2 | 2 | Hash-chained append-only audit log (§16) |
| T10 | 1 | I | Account enumeration | 2 | 1 | Uniform responses and timing (§2) |
| T11 | 1 | E | IDOR: reading another player’s cards or private data | 2 | 2 | Ownership checks in every query use case, authz matrix tests; live frames name only the match's own players, from its entries, never by account id (06 §4) |
| T12 | 2 | S | Malicious site embeds the game (clickjacking) or spoofs postMessage | 2 | 2 | `frame-ancestors` allowlist, strict origin checks, explicit `targetOrigin` (07 §3) |
| T13 | 2 | S | Forged or replayed handoff JWT | 2 | 3 | Pinned algs/keys, aud/exp/jti single use, ≤ 60 s (§4) |
| T14 | 2 | E | Host maps its users to admin roles | 1 | 3 | Mapping can never grant security_admin/super_admin (07 §2.1) |
| T15 | 2 | S | Account takeover via unverified e-mail at an IdP | 2 | 3 | Link only by (iss, sub), no silent e-mail linking (07 §2.1) |
| T16 | 3/4 | T | SQL injection | 1 | 3 | Parameterized queries, lint ban, no DDL for app role (§6) |
| T17 | 4 | I | DB dump leaks secrets | 1 | 3 | Field encryption for secrets/seeds (sealed seeds bound to their match id, strict decoding), hashed tokens, encrypted backups (§9, §15) |
| T18 | 5 | I | SSRF through OIDC discovery, JWKS or webhook URLs | 2 | 3 | SafeHttpClient with allowlist and IP range blocks (§10) |
| T19 | 5 | T | Webhook receiver spoofing / replay | 1 | 1 | HMAC signature with timestamp (07 §5) |
| T20 | 1 | T | Malicious upload (polyglot, script SVG) | 1 | 3 | Admin-only, magic bytes, re-encode, SVG sanitize, isolated serving (§14) |
| T21 | 1 | E | Admin account compromise | 1 | 3 | Mandatory TOTP, short admin sessions, step-up, privilege separation, audit (§2, §3, §5) |
| T22 | 1 | T | Admin manipulates a running match or leaderboard silently | 1 | 2 | Frozen rulesets, encrypted seed, public abort notices, visible adjustments (§11) |
| T23 | 6 | E | Server compromise via SSH | 1 | 3 | Operator hardening checklist (09 §9) |
| T24 | 7 | T | Malicious dependency or tampered image | 2 | 3 | Lockfile, scanners, pinned actions, cosign verify on install/update (§18) |
| T25 | 1 | D | Chat abuse: spam, harassment, illegal content | 3 | 2 | Filters, rate limits, slow mode, reports, sanctions, retention (§12) |
| T26 | all | D | Data loss (disk failure, operator error) | 2 | 3 | Encrypted nightly backups pulled off-site, restore drill (§15) |
| T27 | 1 | I | Personal data exposure in logs | 2 | 2 | No secrets/bodies in logs, IP truncation, pseudonymous IDs (02 §7) |
| T28 | 1 | T | Replayed or duplicated WS intents | 2 | 1 | Per-socket seq, idempotent marks (06 §4) |
| T29 | 1 | E | A long-lived socket keeps host powers after its session expired or the role was removed | 2 | 2 | Every host intent re-reads the session with the HTTP checks; an ended session closes the socket (§3, 06 §2) |

## 5. Residual risks (accepted)

- A determined user with many verified e-mail addresses can still create several accounts; impact is limited to league points, and moderators can merge or remove results.
- A volumetric DDoS beyond the VPS uplink cannot be absorbed without an upstream provider; documented option, not default.
- If the operator loses the backup private key, backups are unreadable — stated prominently in the install output and operator guide.

## 6. Review

The threat model is reviewed at every minor release and whenever a new trust boundary appears (new integration, new upload type, payments — which would require a full redesign and legal review).
