-- @file   apps/server/src/db/migrations/0019_standalone_accounts.sql
-- @brief  Standalone accounts (D60): password reset tokens, admin TOTP factors, recovery codes.
--
-- Responsibility: sbr.password_reset_tokens keeps only the SHA-256 of a reset link's token,
--                 its account, when it was made and expires (1 hour) and when it was used;
--                 sbr.totp_factors the admin's TOTP secret, encrypted with the seed key and
--                 bound to the account, when it was confirmed and the last time step used (no
--                 code twice); sbr.recovery_codes the SHA-256 of ten single-use codes. All go
--                 with the account (ON DELETE CASCADE). sessions.last_2fa_at (0002) marks a
--                 session whose second step is done.
-- Spec:           docs/spec/04-database-design.md §3.1; docs/spec/03-security-architecture.md §1

CREATE TABLE sbr.password_reset_tokens (
    token_hash bytea PRIMARY KEY,
    account_id uuid NOT NULL REFERENCES sbr.accounts (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    used_at timestamptz
);
CREATE INDEX password_reset_tokens_account ON sbr.password_reset_tokens (account_id, created_at);

CREATE TABLE sbr.totp_factors (
    account_id uuid PRIMARY KEY REFERENCES sbr.accounts (id) ON DELETE CASCADE,
    secret_enc bytea NOT NULL,
    confirmed_at timestamptz,
    last_used_step bigint
);

CREATE TABLE sbr.recovery_codes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES sbr.accounts (id) ON DELETE CASCADE,
    code_hash bytea NOT NULL,
    used_at timestamptz,
    UNIQUE (account_id, code_hash)
);
