-- @file   apps/server/src/db/migrations/0006_start_announcement.sql
-- @brief  A set start time is an announcement, with an optional automatic start (D16).
--
-- Responsibility: `start_at` keeps the announced start time of an 'at' match and
--                 `start_auto` whether the match starts itself then (default off);
--                 `starts_at` is from now on only the end of a running countdown. Existing
--                 'at' matches keep their time as the announcement and start automatically,
--                 as they did. The scheduler gains the action `auto_start`.
-- Spec:           docs/spec/01-game-design.md §7.6; docs/spec/04-database-design.md §3.3

ALTER TABLE sbr.matches ADD COLUMN start_at timestamptz;
ALTER TABLE sbr.matches ADD COLUMN start_auto boolean NOT NULL DEFAULT false;
UPDATE sbr.matches SET start_at = starts_at, start_auto = true WHERE start_rule = 'at';

ALTER TABLE sbr.scheduled_actions DROP CONSTRAINT scheduled_actions_kind_check;
ALTER TABLE sbr.scheduled_actions ADD CONSTRAINT scheduled_actions_kind_check CHECK (kind IN (
    'start_match', 'start_round', 'draw', 'close_speed_window', 'auto_mark', 'auto_start'));
