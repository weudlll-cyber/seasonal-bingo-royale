-- @file   apps/server/src/db/migrations/0017_show_on_website.sql
-- @brief  The host's "Show on the Seasonal Entertainment website" per match (D50), off by default.
--
-- Responsibility: sbr.matches.show_on_website: the match's open sign-up is listed in the public
--                 open-rounds answer (docs/OPEN-ROUNDS.md) while its lobby is open. Website mode
--                 only; standalone matches keep false.
-- Spec:           docs/OPEN-ROUNDS.md; docs/spec/07-integration-architecture.md §7

ALTER TABLE sbr.matches ADD COLUMN show_on_website boolean NOT NULL DEFAULT false;
