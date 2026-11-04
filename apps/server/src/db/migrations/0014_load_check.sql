-- @file   apps/server/src/db/migrations/0014_load_check.sql
-- @brief  The role of the temporary accounts of `sbr loadcheck` and its one permission.
--
-- Responsibility: `load_check` marks the accounts the operator's load check makes (only the CLI
--                 inside the app container assigns it, never an HTTP route) and removes again.
--                 Its permission `match.loadcheck` lets such a host create and start its own
--                 match while maintenance is on (the owner runs the check with maintenance on
--                 while players are signed in); nothing else ignores maintenance.
-- Spec:           docs/spec/12-testing-strategy.md §5; docs/spec/09-deployment-architecture.md §4

INSERT INTO sbr.roles (id, description)
VALUES ('load_check', 'Temporary account of the operator''s load check (sbr loadcheck).');

INSERT INTO sbr.role_permissions (role_id, permission) VALUES ('load_check', 'match.loadcheck');
