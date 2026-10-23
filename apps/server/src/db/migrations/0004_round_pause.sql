-- @file   apps/server/src/db/migrations/0004_round_pause.sql
-- @brief  The pause between royale rounds, chosen at creation (D14).
--
-- Responsibility: `round_pause_ms` holds the wait in milliseconds; NULL means the host
--                 starts the next round. Existing matches keep the former fixed 6 s.
-- Spec:           docs/spec/01-game-design.md §7.1 (D14); docs/spec/04-database-design.md §3.3

ALTER TABLE sbr.matches ADD COLUMN round_pause_ms int DEFAULT 6000 CHECK (round_pause_ms >= 0);
