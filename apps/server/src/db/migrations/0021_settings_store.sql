-- @file   apps/server/src/db/migrations/0021_settings_store.sql
-- @brief  The settings store (admin-area §9 piece 2): who may change settings; versions are kept.
--
-- Responsibility: the Admin roles (game_admin, super_admin; website admins are game_admin, D41)
--                 may change settings and undo a change (`settings.edit`). A settings version
--                 is never changed or removed: every change and every undo is a new version
--                 (admin-area §6), so triggers refuse UPDATE, DELETE and TRUNCATE on
--                 sbr.settings_versions and the app role may only INSERT and SELECT there
--                 (../roles.ts); sbr.settings_documents.current_version moves forward.
-- Spec:           docs/concepts/admin-area.md §6, §8 (k); docs/spec/04-database-design.md §3.2

INSERT INTO sbr.role_permissions (role_id, permission) VALUES
    ('game_admin', 'settings.edit'),
    ('super_admin', 'settings.edit');

CREATE FUNCTION sbr.settings_versions_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'settings_versions is append-only';
END;
$$;

CREATE TRIGGER settings_versions_no_update BEFORE UPDATE OR DELETE ON sbr.settings_versions
    FOR EACH ROW EXECUTE FUNCTION sbr.settings_versions_append_only();
CREATE TRIGGER settings_versions_no_truncate BEFORE TRUNCATE ON sbr.settings_versions
    FOR EACH STATEMENT EXECUTE FUNCTION sbr.settings_versions_append_only();
