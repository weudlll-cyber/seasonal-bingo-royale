-- @file   apps/server/src/db/migrations/0015_website_users.sql
-- @brief  Website mode: a member's Discord steps, and where the account-changes feed stopped.
--
-- Responsibility: sbr.accounts.steps holds the steps the website sent at the last sign-in (up
--                 to three { ladder, name, icon }, [] for none; cleared when the website deletes
--                 the account). sbr.website_feed holds the one cursor of the website's
--                 account-changes feed as the website gave it (a string of digits).
-- Spec:           docs/spec/07-integration-architecture.md §2.3, §2.4; docs/spec/04-database-design.md §3.1

ALTER TABLE sbr.accounts ADD COLUMN steps jsonb NOT NULL DEFAULT '[]'
    CHECK (jsonb_typeof(steps) = 'array' AND jsonb_array_length(steps) <= 3);

CREATE TABLE sbr.website_feed (
    id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    cursor text NOT NULL CHECK (cursor ~ '^[0-9]{1,30}$'),
    updated_at timestamptz NOT NULL DEFAULT now()
);
