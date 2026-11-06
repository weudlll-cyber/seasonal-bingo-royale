-- @file   apps/server/src/db/migrations/0018_drop_session_ip_prefix.sql
-- @brief  Drop sbr.sessions.ip_prefix: nothing ever wrote or read it.
--
-- Responsibility: the column came with the first accounts draft (0002) for an address check
--                 that was never built; the game stores no IP address (docs/PRIVACY-DATA.md).
-- Spec:           docs/spec/04-database-design.md §3.1

ALTER TABLE sbr.sessions DROP COLUMN ip_prefix;
