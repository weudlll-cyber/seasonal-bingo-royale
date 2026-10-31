-- @file   apps/server/src/db/migrations/0008_prize_caps.sql
-- @brief  A match's prize list holds short keys only, as the contracts cap them (audit).
--
-- Responsibility: at most 20 prize keys, each 1 to 32 characters (@sbr/contracts
--                 PRIZE_KEY_MAX_LENGTH, MAX_PRIZES), like the display name's length
--                 check. A CHECK cannot hold a subquery, so an immutable function looks
--                 at every key. Existing rows hold built-in keys only (at most 13
--                 characters), which pass.
-- Spec:           docs/spec/04-database-design.md §3.3; docs/spec/05-api-design.md §2.3

CREATE FUNCTION sbr.prize_keys_capped(keys text[]) RETURNS boolean
    LANGUAGE sql IMMUTABLE AS $$
    SELECT cardinality(keys) <= 20
       AND NOT EXISTS (SELECT 1 FROM unnest(keys) AS k WHERE char_length(k) NOT BETWEEN 1 AND 32)
$$;

ALTER TABLE sbr.matches ADD CONSTRAINT matches_prizes_capped CHECK (sbr.prize_keys_capped(prizes));
