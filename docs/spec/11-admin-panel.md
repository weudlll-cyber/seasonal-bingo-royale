# 11 — Admin Panel Design

> Part of the Seasonal Bingo Royale specification. Index: [README](README.md).

## 1. Principles

- Separate app (`apps/admin`) at `/admin`, own bundle, stricter CSP, `frame-ancestors 'none'`.
- Every screen is driven by the **same zod schemas** the server validates with: forms, defaults, min/max, help texts and “what changes if I edit this” notes are generated from schema metadata. One schema, no drift.
- Every change is a **new version** with an optional comment; every document has history, diff view and one-click rollback.
- Destructive or high-impact actions (publish ruleset, abort match, lift a ban, change security settings) require a confirm dialog that states the effect in one sentence, plus 2FA step-up when the last check is older than 10 minutes.
- Navigation shows only what the admin’s permissions allow.

## 2. Navigation

```
Dashboard
Matches          ─ Live · Scheduled · Series · History · Create
Game rules       ─ Rulesets · Patterns · Season effects (inside ruleset) · Simulator
Leaderboards     ─ Periods · Placement points · Adjustments · Badges
Community        ─ Moderation queue · Chat rooms · Sanctions · Word lists
Players          ─ Accounts · Roles
Appearance       ─ Branding · Theme · Sounds
Notifications    ─ E-mail · Web Push · Webhooks
Integrations     ─ Identity providers · Embed origins
System           ─ Feature flags · Security · Rate limits · Matchmaking · Audit log · About (version, health)
```

## 3. Screens

### 3.1 Dashboard
Live tiles: players online, running matches (realtime/async), draws/min, error rate, scheduler lag, open reports, abuse alerts, last backup age, version. Each tile links into its area.

### 3.2 Matches
- **Live**: list of running matches; per match: stage/round, active/eliminated counts, draw count, jackpot, chat activity. Detail view = spectator view + staff actions: pause (async only), abort (reason required, shown publicly), kick player (reason required).
- **Create**: pick a published ruleset version, title, mode, visibility, start rule (time/when full/either), lobby window, max players. Shows a summary of the stage plan computed for the chosen max players (“100 → 50 → 25 → 13 → final”).
- **Series**: recurring matches (cron-like UI: days of week + time + time zone), each instance created 24 h ahead.

### 3.3 Game rules
- **Rulesets** list with versions; edit opens a **draft** in a tabbed form:
  - *General*: mode default, cards per player, free center, marking mode, speed window.
  - *Draws*: interval per mode, quiet hours, catch-up limits.
  - *Stages*: visual stage editor — add/remove/reorder stages, per stage: kind, rounds, round-end condition, cut rule, score carry, stage multiplier. Live preview of field sizes for 20/50/100/200 starters.
  - *Scoring*: base points table, first-to-pattern bonus.
  - *Patterns*: choose active patterns per stage from the pattern library.
  - *Seasons*: four cards (Spring/Summer/Autumn/Winter) with icon, colour, effect type dropdown (catalog from [01-game-design.md](01-game-design.md) §8.2) and its parameter fields; announcement on/off.
  - *Season Complete & Jackpot*: points, optional effect, jackpot base/growth/rollover.
- **Validate** checks cross-field rules (e.g. at least one stage of kind `final`; final win condition reachable; speed window shorter than draw interval).
- **Simulator** runs the selected draft against bots and shows the KPI panel from [05-api-design.md](05-api-design.md) §3.1 side by side with the currently published version.
- **Publish** makes the version available for new matches; running matches are unaffected (stated in the dialog).
- **Patterns**: 5×5 grid editor (click cells), name, points; built-ins are read-only.

### 3.4 Leaderboards
Periods (create, close, rename), placement-points table, minimum players for points, adjustments (delta + mandatory reason, shown on profile), badges (criteria builder: Season Completes ≥ N, wins ≥ N, placement ≤ N in a period).

### 3.5 Community (moderation)
- **Queue**: reported/flagged messages with context (5 messages before/after), actions: dismiss, delete, mute (presets 5 min / 1 h / 24 h / custom), ban, escalate to suspension.
- **Rooms**: slow mode, lock, clear.
- **Sanctions**: active and past, lift with reason.
- **Word lists**: block / mask / flag lists with test field (“would this message pass?”).

### 3.6 Players
Search by display name or e-mail (e-mail visible only with `account.view.pii`), account detail: status, sessions (revoke), roles (assign/remove within own permission), match history, sanctions, abuse score history, linked identities. Suspend/unsuspend with reason.

### 3.7 Appearance
- **Branding**: game title, logo, favicon, season icons (one upload slot each, preview on a sample card), backgrounds.
- **Theme**: colour tokens (four season colours, surface, text, accent), font selection from uploaded fonts, corner radius, density; live preview of lobby, card and leaderboard; contrast checker warns below WCAG AA.
- **Sounds**: per event (draw, mark, pattern, season, season complete, cut, win), volume default, global default off.

### 3.8 Notifications
E-mail (SMTP test send, digest templates with preview, sender name), Web Push (VAPID keys generated at install; enable, test), Webhooks (URL, events, secret, test delivery, delivery log).

### 3.9 Integrations
Identity providers (add OIDC by issuer URL → discovery auto-fill; JWT handoff with JWKS URL or pinned key; claim mapping; role mapping with guard: cannot map to security_admin/super_admin; “Test login” button), embed origins (add/remove; shows the snippet for host pages).

### 3.10 System
- **Feature flags**: list with description, owner context, default, current value (e.g. `auth.guests`, `auth.passkeys`, `chat.allowLinks`, `chat.typingIndicator`, `realtime.allowPolling`, `integrations.webhooks`, `notifications.webPush`, `leaderboard.public`).
- **Security** (`security_admin`): session lifetimes, admin 2FA requirement (super_admin only), password policy, guest mode, abuse thresholds, IP retention.
- **Rate limits** (`security_admin`): every limit from [03-security-architecture.md](03-security-architecture.md) §13 with safe min/max bounds; loosening beyond the shipped default shows a warning.
- **Matchmaking**: default lobby limits, min players, late-join rule, max concurrent matches, max matches per player at once (async).
- **Audit log**: filter by actor, action, target, time; diff view; export.
- **About**: version, commit, image digest, DB migration level, uptime, last backup.

## 4. Configuration key catalogue

The complete, typed catalogue of every key lives in `packages/contracts/src/config/` (one schema file per document) and is the single source of truth. This section names the documents and their top-level keys so the scope is reviewable:

| Document | Top-level keys |
|---|---|
| `ruleset` (versioned per ruleset) | `general`, `draws`, `marking`, `stages[]`, `scoring`, `patterns`, `seasons.{spring,summer,autumn,winter}`, `seasonComplete`, `jackpot`, `lobby` |
| `leaderboard` | `periodLength`, `placementPoints`, `minPlayersForPoints`, `public` |
| `matchmaking` | `defaults.minPlayers`, `defaults.maxPlayers`, `lateJoin`, `maxConcurrentMatches`, `maxParallelPerPlayer` |
| `chat` | `maxLength`, `allowLinks`, `slowModeDefault`, `rateLimit`, `newAccountSlowModeHours`, `retentionDays`, `typingIndicator` |
| `security` | `sessions.*`, `adminRequire2fa`, `password.*`, `guests`, `abuse.*`, `ipRetentionDays` |
| `rate_limits` | `login`, `register`, `passwordReset`, `api`, `ws.*` |
| `branding` | `title`, `logo`, `favicon`, `seasonIcons.*`, `backgrounds` |
| `theme` | `colors.*`, `font`, `radius`, `density` |
| `notifications` | `email.*`, `webPush.*`, `webhooks[]` |
| `features` | flag map |
| `integrations` | `localAccounts`, `providers` (refs), `embedOrigins` (refs), `chatProvider` (`builtin` / `hostEmbed`), `hostChatUrl` |
