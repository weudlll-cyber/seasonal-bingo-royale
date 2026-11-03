-- @file   apps/server/src/db/migrations/0013_external_identities.sql
-- @brief  Identity providers and the external identities linked to accounts (D37, 07 §2.1).
--
-- Responsibility: sbr.identity_providers holds the providers an install accepts; the website's
--                 (`proxy_header`, issuer = the site origin) is created at its first sign-in.
--                 sbr.external_identities links an account to one subject of one provider,
--                 UNIQUE (provider, subject), with the display name and roles of the last
--                 sign-in. The columns for OIDC and the JWT handoff (client, keys, claim and role
--                 mappings, 04 §3.1) come with those adapters.
-- Spec:           docs/spec/04-database-design.md §3.1; docs/spec/07-integration-architecture.md §2.1, §2.3

CREATE TABLE sbr.identity_providers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind text NOT NULL CHECK (kind IN ('oidc', 'jwt_handoff', 'proxy_header')),
    name text NOT NULL,
    issuer text NOT NULL UNIQUE,
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sbr.external_identities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES sbr.accounts (id) ON DELETE CASCADE,
    provider_id uuid NOT NULL REFERENCES sbr.identity_providers (id),
    subject text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 128),
    last_claims jsonb NOT NULL DEFAULT '{}',
    linked_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider_id, subject)
);
CREATE INDEX external_identities_account ON sbr.external_identities (account_id);
