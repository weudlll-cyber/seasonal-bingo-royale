-- @file   apps/server/src/db/migrations/0016_website_deleted.sql
-- @brief  Website mode: the website ids of accounts the website deleted, never signed in again.
--
-- Responsibility: when the website's account-changes feed says an account was deleted, its
--                 game account is deleted as any other (03 §19: the points stay in past rounds
--                 and histories, the account leaves the leaderboard) and its website id is kept
--                 here, so a later sign-in with the same id is refused. Only the website's
--                 opaque id and its origin are kept, nothing personal.
-- Spec:           docs/spec/07-integration-architecture.md §2.4; docs/spec/04-database-design.md §3.1

CREATE TABLE sbr.website_deleted (
    issuer text NOT NULL,
    subject text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 128),
    deleted_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (issuer, subject)
);
