-- @file   apps/server/src/db/migrations/0022_league_corrections.sql
-- @brief  League corrections (admin-area §9 piece 5): a delta of league points with a reason.
--
-- Responsibility: the Admin roles (game_admin, super_admin; website admins are game_admin, D41)
--                 may correct a player's league points (`league.correct`). A correction is one
--                 row: the player, the delta (never 0), the reason the player reads on their
--                 profile, who made it (no foreign key: the History keeps an admin's changes
--                 after the account is gone) and when, and the season period it went into; it
--                 also goes into the all-time board. A correction is never changed: a trigger
--                 refuses UPDATE and TRUNCATE and the app role may only INSERT and SELECT
--                 (../roles.ts); a wrong one is undone by a correction the other way. The
--                 player's rows go with the account (cascade), like their league entries.
-- Spec:           docs/concepts/admin-area.md §4 (League), §9 piece 5; docs/spec/04-database-design.md §3.4

INSERT INTO sbr.role_permissions (role_id, permission) VALUES
    ('game_admin', 'league.correct'),
    ('super_admin', 'league.correct');

CREATE TABLE sbr.league_corrections (
    id bigserial PRIMARY KEY,
    account_id uuid NOT NULL REFERENCES sbr.accounts (id) ON DELETE CASCADE,
    season_period_id uuid NOT NULL REFERENCES sbr.leaderboard_periods (id),
    delta int NOT NULL CHECK (delta <> 0 AND delta BETWEEN -10000 AND 10000),
    reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 3 AND 200),
    created_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX league_corrections_account ON sbr.league_corrections (account_id, created_at DESC);

CREATE FUNCTION sbr.league_corrections_unchanged() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'league_corrections are never changed';
END;
$$;

CREATE TRIGGER league_corrections_no_update BEFORE UPDATE ON sbr.league_corrections
    FOR EACH ROW EXECUTE FUNCTION sbr.league_corrections_unchanged();
CREATE TRIGGER league_corrections_no_truncate BEFORE TRUNCATE ON sbr.league_corrections
    FOR EACH STATEMENT EXECUTE FUNCTION sbr.league_corrections_unchanged();
