-- @file   apps/server/src/db/migrations/0009_leaderboards.sql
-- @brief  Leaderboard periods, league entries and awards, badges (WP-15).
--
-- Responsibility: the tables of 04 §3.4 at first-draft depth and the badges of 04 §3.1. One
--                 all-time period is seeded; season periods (calendar quarters) are created
--                 when a match first awards points in them. A league award is keyed by period,
--                 account and match, so a match awards once however often it is projected.
--                 Every row of an account goes with the account (cascade). Left out until code
--                 uses them: leaderboard_adjustments and player_profiles (profile figures are
--                 read from the match entries).
-- Spec:           docs/spec/04-database-design.md §3.1, §3.4; docs/spec/03-security-architecture.md §11

CREATE TABLE sbr.leaderboard_periods (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind text NOT NULL CHECK (kind IN ('season', 'all_time')),
    name text NOT NULL,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
    -- The placement-points table and the counting rule the period was created with.
    config jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (kind, starts_at),
    CHECK ((kind = 'all_time') = (ends_at IS NULL))
);

-- The all-time board (01 §10): one period without an end. The table is the default of
-- @sbr/contracts LEADERBOARD_DEFAULTS.
INSERT INTO sbr.leaderboard_periods (kind, name, starts_at, config) VALUES (
    'all_time', 'All time', '2026-01-01T00:00:00Z',
    '{"placementPoints":[{"from":1,"to":1,"points":100},{"from":2,"to":2,"points":70},{"from":3,"to":3,"points":50},{"from":4,"to":10,"points":25},{"from":11,"to":25,"points":10}],"finalistBonus":10,"finishBonus":2,"minPlayersForPoints":8,"requireVerifiedPlayers":true}'
);

CREATE TABLE sbr.league_entries (
    period_id uuid NOT NULL REFERENCES sbr.leaderboard_periods (id),
    account_id uuid NOT NULL REFERENCES sbr.accounts (id) ON DELETE CASCADE,
    points int NOT NULL DEFAULT 0,
    wins int NOT NULL DEFAULT 0,
    season_completes int NOT NULL DEFAULT 0,
    matches int NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (period_id, account_id)
);
CREATE INDEX league_entries_rank
    ON sbr.league_entries (period_id, points DESC, wins DESC, season_completes DESC);
CREATE INDEX league_entries_account ON sbr.league_entries (account_id);

-- Idempotent (04 §3.4): a match awards an account once per period.
CREATE TABLE sbr.league_awards (
    period_id uuid NOT NULL REFERENCES sbr.leaderboard_periods (id),
    account_id uuid NOT NULL REFERENCES sbr.accounts (id) ON DELETE CASCADE,
    match_id uuid NOT NULL REFERENCES sbr.matches (id),
    points int NOT NULL,
    place int NOT NULL,
    awarded_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (period_id, account_id, match_id)
);
CREATE INDEX league_awards_account ON sbr.league_awards (account_id, match_id);

CREATE TABLE sbr.badges (
    id text PRIMARY KEY,
    name text NOT NULL,
    criteria jsonb NOT NULL
);

-- The one badge the spec names (01 §8.3): all four seasons activated within one match.
INSERT INTO sbr.badges (id, name, criteria) VALUES
    ('season-complete', 'Season Complete', '{"seasonComplete":true}');

CREATE TABLE sbr.badges_awarded (
    account_id uuid NOT NULL REFERENCES sbr.accounts (id) ON DELETE CASCADE,
    badge_id text NOT NULL REFERENCES sbr.badges (id),
    match_id uuid NOT NULL REFERENCES sbr.matches (id),
    awarded_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (account_id, badge_id, match_id)
);
