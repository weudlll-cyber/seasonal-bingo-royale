-- @file   apps/server/src/db/migrations/0003_matches.sql
-- @brief  Match persistence: matches, entries, event log, snapshots, marks, standings, scheduler (WP-10).
--
-- Responsibility: the match tables of 04 §3.3 at first-draft depth. The event log is the
--                 source of truth (append-only, 02 §5.2); entries, standings and marks are
--                 projections written in the same transaction; scheduled_actions drives
--                 timed commands with leases (02 §5.3). Players are keyed by `player_id`
--                 (the account id, or `bot-NN` for development bots, which have no
--                 account). Rounds, cards and draws live in the event log for now; their
--                 own tables arrive with the read models that need them.
-- Spec:           docs/spec/04-database-design.md §3.3; docs/spec/02-software-architecture.md §5.2–§5.4

CREATE TABLE sbr.matches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    title text NOT NULL,
    game_type text NOT NULL CHECK (game_type IN ('royale', 'classicSeasons', 'classic')),
    mode text NOT NULL DEFAULT 'realtime' CHECK (mode IN ('realtime', 'async')),
    -- The published ruleset the match was opened with, frozen (04 §3.3: ruleset_version_id
    -- once rulesets are versioned in the admin panel, WP-20).
    ruleset_name text NOT NULL,
    ruleset jsonb NOT NULL,
    status text NOT NULL DEFAULT 'lobby'
        CHECK (status IN ('scheduled', 'lobby', 'running', 'finished', 'aborted')),
    visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'unlisted', 'invite')),
    max_players int NOT NULL CHECK (max_players BETWEEN 2 AND 200),
    starts_at timestamptz,
    started_at timestamptz,
    finished_at timestamptz,
    seed_commitment bytea NOT NULL,
    seed_enc bytea NOT NULL,
    prizes text[] NOT NULL DEFAULT '{}',
    counts_for_leaderboard boolean NOT NULL,
    marking_mode text NOT NULL DEFAULT 'manual' CHECK (marking_mode IN ('auto', 'manual')),
    draw_mode text NOT NULL DEFAULT 'auto' CHECK (draw_mode IN ('auto', 'host')),
    missed_numbers text NOT NULL DEFAULT 'autoMarkAfter'
        CHECK (missed_numbers IN ('autoMarkAfter', 'noAutoMark')),
    auto_mark_delay_ms int NOT NULL DEFAULT 3000,
    draw_interval_ms int NOT NULL,
    version bigint NOT NULL DEFAULT 0,
    created_by uuid REFERENCES sbr.accounts (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    aborted_reason text,
    CHECK ((game_type = 'royale') = (prizes = '{}'))
);

CREATE TABLE sbr.match_entries (
    match_id uuid NOT NULL REFERENCES sbr.matches (id) ON DELETE CASCADE,
    player_id text NOT NULL,
    account_id uuid REFERENCES sbr.accounts (id),
    is_bot boolean NOT NULL DEFAULT false,
    joined_at timestamptz NOT NULL DEFAULT now(),
    state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'eliminated', 'left', 'kicked')),
    eliminated_at_round int,
    final_place int,
    score bigint NOT NULL DEFAULT 0,
    shield_charges int NOT NULL DEFAULT 0,
    seasons_activated smallint NOT NULL DEFAULT 0,
    last_seen_event_seq bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (match_id, player_id)
);
CREATE INDEX match_entries_account ON sbr.match_entries (account_id, match_id);

CREATE TABLE sbr.match_events (
    match_id uuid NOT NULL REFERENCES sbr.matches (id) ON DELETE CASCADE,
    seq bigint NOT NULL,
    type text NOT NULL,
    payload jsonb NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    actor_account_id uuid,
    PRIMARY KEY (match_id, seq)
);

-- Append-only (04 §3.3): an event, once written, is never changed or removed.
CREATE FUNCTION sbr.match_events_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'match_events is append-only';
END;
$$;
CREATE TRIGGER match_events_no_update BEFORE UPDATE OR DELETE ON sbr.match_events
    FOR EACH ROW EXECUTE FUNCTION sbr.match_events_append_only();

CREATE TABLE sbr.match_snapshots (
    match_id uuid NOT NULL REFERENCES sbr.matches (id) ON DELETE CASCADE,
    seq bigint NOT NULL,
    state jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (match_id, seq)
);

-- Per-cell marks, kept 90 days (retention job, decided 2026-10-20).
CREATE TABLE sbr.marks (
    match_id uuid NOT NULL REFERENCES sbr.matches (id) ON DELETE CASCADE,
    player_id text NOT NULL,
    round_index int NOT NULL,
    card_index smallint NOT NULL,
    cell smallint NOT NULL,
    draw_index smallint,
    received_at timestamptz NOT NULL DEFAULT now(),
    source text NOT NULL CHECK (source IN ('manual', 'auto')),
    speed_bonus smallint NOT NULL DEFAULT 0,
    PRIMARY KEY (match_id, player_id, round_index, card_index, cell)
);
CREATE INDEX marks_received_at ON sbr.marks (received_at);

CREATE TABLE sbr.standings (
    match_id uuid NOT NULL REFERENCES sbr.matches (id) ON DELETE CASCADE,
    player_id text NOT NULL,
    rank int NOT NULL,
    score bigint NOT NULL,
    seasons smallint NOT NULL,
    updated_seq bigint NOT NULL,
    PRIMARY KEY (match_id, player_id)
);
CREATE INDEX standings_rank ON sbr.standings (match_id, rank);

CREATE TABLE sbr.scheduled_actions (
    id bigserial PRIMARY KEY,
    match_id uuid NOT NULL REFERENCES sbr.matches (id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN (
        'start_match', 'start_round', 'draw', 'close_speed_window', 'auto_mark')),
    payload jsonb NOT NULL DEFAULT '{}',
    due_at timestamptz NOT NULL,
    lease_owner text,
    lease_until timestamptz,
    attempts int NOT NULL DEFAULT 0,
    done_at timestamptz
);
CREATE INDEX scheduled_actions_due ON sbr.scheduled_actions (due_at) WHERE done_at IS NULL;
