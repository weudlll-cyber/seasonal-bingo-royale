-- @file   apps/server/src/db/migrations/0001_initial.sql
-- @brief  Create the sbr schema and the identity/configuration tables of WP-03.
--
-- Responsibility: roles, role_permissions, settings_documents and settings_versions
--                 (04 §3.1 and §3.2) plus the seed rows every install starts with (04 §6).
--                 Match tables, chat, audit and the rest arrive in later work packages.
-- Spec:           docs/spec/04-database-design.md §3.1, §3.2, §6

CREATE SCHEMA IF NOT EXISTS sbr;

-- Static catalogue of roles (04 §3.1). Permissions attach through role_permissions.
CREATE TABLE sbr.roles (
    id text PRIMARY KEY,
    description text NOT NULL
);

CREATE TABLE sbr.role_permissions (
    role_id text NOT NULL REFERENCES sbr.roles (id) ON DELETE CASCADE,
    permission text NOT NULL,
    PRIMARY KEY (role_id, permission)
);

-- Settings live as versioned JSON documents (04 §3.2, 11 §4). WP-03 only creates the
-- shape; the schema-driven editor and the actual document contents arrive in WP-20.
CREATE TABLE sbr.settings_documents (
    id text PRIMARY KEY,
    current_version integer NOT NULL DEFAULT 1
);

CREATE TABLE sbr.settings_versions (
    document_id text NOT NULL REFERENCES sbr.settings_documents (id) ON DELETE CASCADE,
    version integer NOT NULL,
    document jsonb NOT NULL,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    comment text,
    PRIMARY KEY (document_id, version)
);

-- Seed rows (04 §6): the role catalogue of 03 §5 and the empty settings documents of
-- 11 §4. Permissions and the actual default values of each document land with the work
-- packages that own them (WP-19, WP-20).
INSERT INTO sbr.roles (id, description) VALUES
    ('super_admin', 'Full access, assigns security permissions.'),
    ('security_admin', 'Edits security, rate limits and integrations settings.'),
    ('game_admin', 'Edits rulesets, matches and leaderboards.'),
    ('moderator', 'Chat moderation and sanctions.'),
    ('organizer', 'Creates matches from published rulesets.'),
    ('player', 'Default role for registered users.');

INSERT INTO sbr.settings_documents (id) VALUES
    ('security'),
    ('rate_limits'),
    ('branding'),
    ('theme'),
    ('notifications'),
    ('features'),
    ('chat'),
    ('leaderboard'),
    ('matchmaking'),
    ('integrations');

INSERT INTO sbr.settings_versions (document_id, version, document)
SELECT id, 1, '{}'::jsonb FROM sbr.settings_documents;
