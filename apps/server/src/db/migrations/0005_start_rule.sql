-- @file   apps/server/src/db/migrations/0005_start_rule.sql
-- @brief  How a match starts, chosen at creation (01 §7.6).
--
-- Responsibility: `start_rule` is 'host' (the host presses Start), 'at' (at the set time
--                 kept in starts_at) or 'whenFull' (when every place is taken). Existing
--                 matches keep the host's Start.
-- Spec:           docs/spec/01-game-design.md §7.6; docs/spec/04-database-design.md §3.3

ALTER TABLE sbr.matches ADD COLUMN start_rule text NOT NULL DEFAULT 'host'
    CHECK (start_rule IN ('host', 'at', 'whenFull'));
