-- @file   apps/server/src/db/migrations/0023_technical.sql
-- @brief  The Technical section (admin-area §9 piece 7): who may change it in a standalone install.
--
-- Responsibility: the owner (`super_admin`) may change the Technical section's values
--                 (`technical.edit`; `security_admin` is folded into it, admin-area §8 (f)). In
--                 website mode nobody is super_admin (D41): the route lets the website admins
--                 through with `settings.edit` there instead (§8 (e)), so no grant is needed.
-- Spec:           docs/concepts/admin-area.md §2, §8 (c), (e), (f), §9 piece 7

INSERT INTO sbr.role_permissions (role_id, permission) VALUES
    ('super_admin', 'technical.edit');
