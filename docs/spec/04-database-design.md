# 04 — Database Design

> Part of the Seasonal Bingo Royale specification. Index: [README](README.md).
> PostgreSQL 17. All tables in schema `sbr`. Migrations with drizzle-kit, one SQL file per change, never edited after merge.

## 1. Conventions

- Primary keys: `id uuid` (UUIDv7, generated in the app).
- Timestamps: `timestamptz`, UTC, columns `created_at`, `updated_at` where rows change.
- Names: `snake_case`, plural table names, FK columns `<entity>_id`.
- Enums: PostgreSQL `text` + `CHECK` constraint (easier migrations than native enums).
- JSON: `jsonb` only for versioned configuration documents and event payloads; everything that is queried or joined is a column.
- **No monetary columns anywhere** (no balance, currency, wallet, price). A migration adding one must reference a legal review (see [01-game-design.md](01-game-design.md) §1.1).
- DB roles: `sbr_migrator` (DDL, used only by migrations), `sbr_app` (DML on all tables except restricted ones below), `sbr_readonly` (backups, reporting).

## 2. Entity overview

```
accounts ─┬─ sessions
          ├─ external_identities ── identity_providers
          ├─ role_assignments ── roles ── role_permissions
          ├─ totp_factors, recovery_codes
          ├─ player_profiles ─ badges_awarded ── badges
          └─ notification_subscriptions

rulesets ── ruleset_versions ─┬─ (jsonb document incl. season effects, scoring, template)
                              └─ patterns (referenced by id inside the document)
settings_documents ── settings_versions

matches ─┬─ match_entries (player in match)
         ├─ match_events (append-only log)  ── match_snapshots
         ├─ rounds ─┬─ cards ── card_cells (projection)
         │          ├─ draws
         │          └─ marks
         ├─ standings (projection)
         └─ scheduled_actions

leaderboard_periods ── league_entries
                    └─ leaderboard_adjustments

chat_rooms ─┬─ chat_messages ── chat_reports
            └─ chat_sanctions
profanity_lists

notifications, push_subscriptions
uploads
audit_log
jwt_replay_cache
rate_limit_buckets (only if not in-memory)
embed_origins
```

## 3. Tables

### 3.1 Identity & access

**accounts**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| email | citext UNIQUE NULL | NULL for accounts that exist only through an external identity |
| email_verified_at | timestamptz NULL | |
| password_hash | text NULL | argon2id encoded string; NULL for external-only accounts |
| display_name | text NOT NULL | 3–24 chars, unique case-insensitive (`display_name_key` citext UNIQUE) |
| status | text | `active`, `suspended`, `deleted` |
| created_at, updated_at, last_login_at | timestamptz | |

**sessions** — `id uuid`, `account_id FK`, `token_hash bytea UNIQUE`, `kind` (`player`/`admin`/`guest`), `created_at`, `last_seen_at`, `expires_at`, `idle_expires_at`, `last_2fa_at`, `user_agent text`, `ip_prefix inet`, `revoked_at`. Index on `(account_id) WHERE revoked_at IS NULL`.

**identity_providers** — `id`, `kind` (`oidc`/`jwt_handoff`), `name`, `issuer text UNIQUE`, `client_id`, `client_secret_enc bytea NULL`, `jwks_url NULL`, `pinned_public_key NULL`, `allowed_algs text[]`, `audience text`, `claim_mapping jsonb` (display name, avatar, roles), `role_mapping jsonb`, `enabled bool`, `created_at`, `updated_at`.

**external_identities** — `id`, `account_id FK`, `provider_id FK`, `subject text`, `last_claims jsonb` (minimal: name, picture), `linked_at`. UNIQUE `(provider_id, subject)`.

**roles** — `id text PK` (`player`, `organizer`, …), `description`.
**role_permissions** — `role_id`, `permission text`; PK both.
**role_assignments** — `account_id`, `role_id`, `granted_by`, `granted_at`, `source` (`manual`/`idp_mapping`); PK `(account_id, role_id)`.

**totp_factors** — `account_id PK`, `secret_enc bytea`, `confirmed_at`, `last_used_step bigint` (prevents TOTP code reuse).
**recovery_codes** — `id`, `account_id`, `code_hash`, `used_at`.
**password_reset_tokens** / **email_verification_tokens** — `token_hash PK`, `account_id`, `expires_at`, `used_at`.

**player_profiles** — `account_id PK`, `avatar_key text`, `matches_played int`, `wins int`, `best_placement int NULL`, `season_completes int`, `privacy jsonb` (show online status, etc.). Counters are projections updated by `MatchFinished` handlers.

**badges** — `id text PK`, `name`, `icon_upload_id NULL`, `criteria jsonb`.
**badges_awarded** — `account_id`, `badge_id`, `match_id NULL`, `awarded_at`; PK `(account_id, badge_id, match_id)`.

### 3.2 Configuration

**rulesets** — `id`, `name UNIQUE`, `mode_default` (`realtime`/`async`), `archived bool`, `created_at`.

**ruleset_versions** — `id`, `ruleset_id FK`, `version int`, `status` (`draft`/`published`/`retired`), `document jsonb` (validated by `RulesetSchema`), `schema_version int`, `created_by`, `created_at`, `published_by`, `published_at`. UNIQUE `(ruleset_id, version)`. A published version is immutable (trigger rejects updates when `status <> 'draft'`, except the transition to `retired`).

**patterns** — `id`, `name UNIQUE`, `mask bit(25)` (row-major 5×5), `points int`, `builtin bool`, `archived bool`. Built-ins: rows ×5, columns ×5, diagonals ×2, four corners, X, full house.

**settings_documents** — `id text PK` (`security`, `rate_limits`, `branding`, `theme`, `notifications`, `features`, `chat`, `leaderboard`, `matchmaking`), `current_version int`.
**settings_versions** — `document_id`, `version`, `document jsonb`, `created_by`, `created_at`, `comment text`; PK `(document_id, version)`.

**embed_origins** — `origin text PK` (scheme+host+port), `label`, `allow_auth_handoff bool`, `created_by`, `created_at`.

### 3.3 Matches

**matches**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| code | text UNIQUE | short public code |
| title | text | |
| mode | text | `realtime` / `async` |
| ruleset_version_id | uuid FK | frozen at lobby open |
| status | text | `scheduled`, `lobby`, `running`, `finished`, `aborted` |
| visibility | text | `public`, `unlisted`, `invite` |
| starts_at | timestamptz NULL | |
| started_at, finished_at | timestamptz NULL | |
| timezone | text | for quiet hours |
| seed_commitment | bytea | sha256(seed) |
| seed_enc | bytea | AES-GCM; readable by API only when `status IN ('finished','aborted')` |
| current_stage int, current_round int | | |
| version | bigint | optimistic concurrency |
| created_by | uuid FK | organizer |
| aborted_reason | text NULL | |

**match_entries** — `match_id`, `account_id`, `joined_at`, `state` (`active`, `eliminated`, `left`, `kicked`), `eliminated_at_round int NULL`, `final_place int NULL`, `score bigint`, `shield_charges int`, `seasons_activated smallint` (bitmask 4 bits), `season_complete_at_round int NULL`, `last_scoring_draw int NULL`, `last_seen_event_seq bigint` (for “while you were away”). PK `(match_id, account_id)`. Index `(account_id, match_id)`.

**match_events** — `match_id`, `seq bigint`, `type text`, `payload jsonb`, `occurred_at`, `actor_account_id NULL`. PK `(match_id, seq)`. Append-only (trigger). Payload schemas per event type in `contracts/events`.

**match_snapshots** — `match_id`, `seq`, `state jsonb`, `created_at`. Keep last 3 per match while running; delete all but last after finish.

**rounds** — `id`, `match_id`, `stage_index`, `round_index`, `status`, `started_at`, `ended_at`, `end_reason`, `draw_count int`, `jackpot_points int`. UNIQUE `(match_id, stage_index, round_index)`.

**cards** — `id`, `round_id`, `account_id`, `card_index smallint`, `numbers smallint[25]`, `season_cells smallint[4]` (cell indexes for spring, summer, autumn, winter in that order), `marked bit(25)`, `patterns_done text[]`. Index `(round_id, account_id)`.

**draws** — `round_id`, `draw_index smallint`, `number smallint`, `drawn_at timestamptz`; PK `(round_id, draw_index)`; UNIQUE `(round_id, number)`.

**marks** — `card_id`, `cell smallint`, `draw_index smallint`, `received_at timestamptz`, `source` (`manual`/`auto`), `speed_bonus smallint`; PK `(card_id, cell)` (idempotent).

**standings** — projection: `match_id`, `account_id`, `rank int`, `score bigint`, `patterns int`, `seasons smallint`, `updated_seq bigint`; PK `(match_id, account_id)`; index `(match_id, rank)`.

**scheduled_actions** — `id`, `match_id`, `kind` (`draw`, `close_speed_window`, `start_round`, `start_match`, `lobby_close`), `due_at`, `lease_owner text NULL`, `lease_until timestamptz NULL`, `attempts int`, `done_at NULL`. Partial index `(due_at) WHERE done_at IS NULL`.

### 3.4 Leaderboards

**leaderboard_periods** — `id`, `kind` (`season`/`all_time`), `name` (“Spring 2027”), `starts_at`, `ends_at NULL`, `status` (`active`/`closed`), `config jsonb` (placement-points table snapshot).
**league_entries** — `period_id`, `account_id`, `points int`, `wins int`, `season_completes int`, `matches int`, `updated_at`; PK `(period_id, account_id)`; index `(period_id, points DESC, wins DESC, season_completes DESC)`.
**league_awards** — `period_id`, `account_id`, `match_id`, `points int`, `place int`; PK `(period_id, account_id, match_id)` (idempotent: a match awards once).
**leaderboard_adjustments** — `id`, `period_id`, `account_id`, `delta int`, `reason text NOT NULL`, `actor_account_id`, `created_at`. Visible on the player’s profile.

### 3.5 Chat & moderation

**chat_rooms** — `id`, `kind` (`lobby`, `match`, `system`), `match_id NULL UNIQUE`, `slow_mode_seconds int`, `locked bool`, `created_at`.
**chat_messages** — `id`, `room_id`, `account_id`, `body text` (≤ 300), `body_filtered text` (after masking), `flags text[]`, `created_at`, `deleted_at NULL`, `deleted_by NULL`. Index `(room_id, created_at DESC)`. Retention job deletes rows older than `chat.retentionDays`.
**chat_reports** — `id`, `message_id`, `reporter_id`, `reason`, `status` (`open`/`actioned`/`dismissed`), `handled_by`, `handled_at`.
**chat_sanctions** — `id`, `account_id`, `kind` (`mute`, `ban`), `scope` (`global` or room id), `reason`, `created_by`, `created_at`, `expires_at NULL`, `lifted_at NULL`, `lifted_by NULL`. Index `(account_id) WHERE lifted_at IS NULL`.
**profanity_lists** — `id`, `action` (`block`/`mask`/`flag`), `terms text[]`, `updated_by`, `updated_at`.

### 3.6 Notifications, uploads, security tables

**notifications** — `id`, `account_id`, `kind`, `payload jsonb`, `created_at`, `read_at NULL`. Index `(account_id, created_at DESC) WHERE read_at IS NULL`.
**push_subscriptions** — `id`, `account_id`, `endpoint text UNIQUE`, `p256dh`, `auth`, `created_at`.
**email_digest_prefs** — `account_id PK`, `enabled bool`, `frequency`.
**uploads** — `id`, `kind` (`image`, `svg`, `font`, `audio`), `purpose` (`logo`, `season_icon_spring`, …), `storage_key`, `mime`, `bytes int`, `sha256 bytea`, `width/height NULL`, `uploaded_by`, `created_at`.
**audit_log** — `id bigserial`, `occurred_at`, `actor_account_id NULL`, `actor_roles text[]`, `ip inet NULL`, `action text`, `target_type`, `target_id`, `diff jsonb`, `request_id`, `prev_hash bytea`, `hash bytea`. Append-only; `sbr_app` has INSERT and SELECT only.
**jwt_replay_cache** — `issuer`, `jti`, `expires_at`; PK `(issuer, jti)`; cleaned every minute.

## 4. Integrity constraints worth naming

- `draws`: `number BETWEEN 1 AND 75`, unique per round → a number can never be drawn twice.
- `marks`: insert only if `(round, number)` exists in `draws` — enforced in the use case and by a deferred constraint trigger as safety net.
- `match_entries.score` is updated only by the projection inside the event transaction.
- `league_awards` PK makes awarding a match twice impossible.
- Published `ruleset_versions` and `match_events` and `audit_log` are immutable by trigger.

## 5. Sizing (200 concurrent, generous)

- Per realtime match of 200 players, 5 rounds × 50 draws: ~1 000 cards, ~50 000 marks, ~2 000 events. ≈ 10 MB.
- 50 matches/day → < 1 GB/month before cleanup; snapshots and per-cell marks of finished matches older than 90 days are compacted (cards keep `marked` bitmask, `marks` rows are deleted).

## 6. Migrations and seed

- `apps/server/db/migrations/NNNN_name.sql`, generated by drizzle-kit and reviewed.
- Migration runs as a separate container step (`sbr-migrate`) before the app starts; the app refuses to start on a schema mismatch.
- Seed on first install: roles + permissions, built-in patterns, default ruleset “royale-realtime” and “royale-async” (version 1, published), settings version 1 from defaults, lobby chat room, first leaderboard period. The first super admin is created by the install script (bootstrap token flow, see [09-deployment-architecture.md](09-deployment-architecture.md) §5).
