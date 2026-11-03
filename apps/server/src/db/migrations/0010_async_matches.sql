-- @file   apps/server/src/db/migrations/0010_async_matches.sql
-- @brief  Asynchronous matches: the match's time zone and quiet hours (WP-14).
--
-- Responsibility: `timezone` is the IANA time zone the quiet hours are read in (04 §3.3;
--                 'UTC' for every existing match); `quiet_start_hour` and `quiet_end_hour`
--                 are the quiet hours of an asynchronous match (01 §5: whole hours, start
--                 inclusive, end exclusive, both NULL without quiet hours). Realtime matches
--                 never have quiet hours. `mode` and `match_entries.last_seen_event_seq`
--                 exist since 0003.
-- Spec:           docs/spec/01-game-design.md §5, §11; docs/spec/04-database-design.md §3.3

ALTER TABLE sbr.matches ADD COLUMN timezone text NOT NULL DEFAULT 'UTC'
    CHECK (char_length(timezone) BETWEEN 1 AND 64);
ALTER TABLE sbr.matches ADD COLUMN quiet_start_hour smallint CHECK (quiet_start_hour BETWEEN 0 AND 23);
ALTER TABLE sbr.matches ADD COLUMN quiet_end_hour smallint CHECK (quiet_end_hour BETWEEN 0 AND 23);
ALTER TABLE sbr.matches ADD CONSTRAINT matches_quiet_hours_async CHECK (
    (quiet_start_hour IS NULL) = (quiet_end_hour IS NULL)
    AND (quiet_start_hour IS NULL OR mode = 'async'));
