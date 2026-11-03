-- @file   apps/server/src/db/migrations/0011_lobby_window.sql
-- @brief  The scheduler's `lobby_close` action: an asynchronous lobby's 24 hours are over (D31).
--
-- Responsibility: the kind check of sbr.scheduled_actions is replaced by one that also allows
--                 `lobby_close` (the match then starts with enough players or the system cancels
--                 it). The check stays in force; only the list of allowed kinds grows.
-- Spec:           docs/spec/01-game-design.md §7.6 (D31); docs/spec/04-database-design.md §3.3

ALTER TABLE sbr.scheduled_actions DROP CONSTRAINT scheduled_actions_kind_check;
ALTER TABLE sbr.scheduled_actions ADD CONSTRAINT scheduled_actions_kind_check CHECK (kind IN (
    'start_match', 'start_round', 'draw', 'close_speed_window', 'auto_mark', 'auto_start',
    'lobby_close'));
