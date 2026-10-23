-- @file   apps/server/src/db/migrations/0002_accounts.sql
-- @brief  Local accounts, sessions and role assignments (WP-09).
--
-- Responsibility: accounts, sessions and role_assignments of 04 §3.1, the permissions the
--                 first draft of the real game checks (03 §5.2) and the guest role. Email
--                 verification and 2FA tables arrive when those features leave their flags.
-- Spec:           docs/spec/04-database-design.md §3.1; docs/spec/03-security-architecture.md §2.1, §3, §5

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE sbr.accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email citext UNIQUE,
    email_verified_at timestamptz,
    password_hash text,
    display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 3 AND 24),
    display_name_key citext NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    last_login_at timestamptz
);

-- The cookie carries a random 256-bit id; only its SHA-256 is stored (03 §3). Guest
-- sessions have no account. csrf_token is the per-session synchronizer token (03 §8).
CREATE TABLE sbr.sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid REFERENCES sbr.accounts (id) ON DELETE CASCADE,
    token_hash bytea NOT NULL UNIQUE,
    csrf_token text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('player', 'admin', 'guest')),
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    idle_expires_at timestamptz NOT NULL,
    last_2fa_at timestamptz,
    user_agent text,
    ip_prefix inet,
    revoked_at timestamptz
);
CREATE INDEX sessions_account_active ON sbr.sessions (account_id) WHERE revoked_at IS NULL;

CREATE TABLE sbr.role_assignments (
    account_id uuid NOT NULL REFERENCES sbr.accounts (id) ON DELETE CASCADE,
    role_id text NOT NULL REFERENCES sbr.roles (id),
    granted_by uuid,
    granted_at timestamptz NOT NULL DEFAULT now(),
    source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'idp_mapping')),
    PRIMARY KEY (account_id, role_id)
);

INSERT INTO sbr.roles (id, description) VALUES ('guest', 'Watch matches and read chat.');

-- Permissions the first draft checks (03 §5.2). Code checks permissions, never roles.
INSERT INTO sbr.role_permissions (role_id, permission) VALUES
    ('guest', 'match.watch'),
    ('player', 'match.watch'),
    ('player', 'match.join'),
    ('organizer', 'match.watch'),
    ('organizer', 'match.join'),
    ('organizer', 'match.create'),
    ('organizer', 'match.manage'),
    ('game_admin', 'match.watch'),
    ('game_admin', 'match.create'),
    ('game_admin', 'match.manage'),
    ('game_admin', 'match.abort'),
    ('super_admin', 'match.watch'),
    ('super_admin', 'match.create'),
    ('super_admin', 'match.manage'),
    ('super_admin', 'match.abort');
