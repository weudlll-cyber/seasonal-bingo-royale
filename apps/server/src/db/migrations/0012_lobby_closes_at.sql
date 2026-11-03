-- @file   apps/server/src/db/migrations/0012_lobby_closes_at.sql
-- @brief  When an asynchronous lobby closes (D31, D33), for the scheduler and the screens (D34).
--
-- Responsibility: sbr.matches.lobby_closes_at holds the end of an asynchronous match's lobby:
--                 its announced start time, else 24 hours after creation. NULL for realtime
--                 matches and for asynchronous lobbies created before this column (their
--                 `lobby_close` action is already scheduled; the screens show no closing time).
-- Spec:           docs/spec/01-game-design.md §7.6 (D31, D33, D34); docs/spec/04-database-design.md §3

ALTER TABLE sbr.matches ADD COLUMN lobby_closes_at timestamptz;
