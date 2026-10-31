-- @file   apps/server/src/db/migrations/0007_seed_binding.sql
-- @brief  The sealed seed column says whether it is bound to its match id (audit: AAD).
--
-- Responsibility: `seed_enc_version` is 3 when `seed_enc` was sealed with the match id as
--                 additional authenticated data (a sealed seed copied into another match
--                 does not open), 2 for the seeds stored before, which stay as they are.
--                 New matches write 3 (../../match/codec SEED_COLUMN_VERSION).
-- Spec:           docs/spec/04-database-design.md §3.3; docs/spec/03-security-architecture.md §9

ALTER TABLE sbr.matches ADD COLUMN seed_enc_version smallint NOT NULL DEFAULT 2
    CHECK (seed_enc_version IN (2, 3));
