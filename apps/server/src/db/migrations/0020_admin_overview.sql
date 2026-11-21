-- @file   apps/server/src/db/migrations/0020_admin_overview.sql
-- @brief  The admin area's first piece: its permissions and the audit log (admin-area §9 piece 1).
--
-- Responsibility: the Admin roles (game_admin, super_admin; website admins are game_admin, D41)
--                 may see the Overview (`admin.view`) and switch maintenance (`maintenance.manage`);
--                 aborting any match is their seeded `match.abort`. sbr.audit_log records every
--                 change made in the admin area: when, who (the account id, no foreign key, so an
--                 account's deletion never touches the log; its roles at the time), what (action,
--                 target, the change as JSON) and the request id; no IP address (the game stores
--                 none, docs/PRIVACY-DATA.md). Each entry carries the hash of the one before and
--                 its own, so a changed or removed entry breaks the chain. Append-only: triggers
--                 refuse UPDATE, DELETE and TRUNCATE, and the app role has INSERT and SELECT only
--                 (../roles.ts).
-- Spec:           docs/concepts/admin-area.md §2.2, §6; docs/spec/04-database-design.md §3

INSERT INTO sbr.role_permissions (role_id, permission) VALUES
    ('game_admin', 'admin.view'),
    ('game_admin', 'maintenance.manage'),
    ('super_admin', 'admin.view'),
    ('super_admin', 'maintenance.manage');

CREATE TABLE sbr.audit_log (
    id bigserial PRIMARY KEY,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    actor_account_id uuid,
    actor_roles text[] NOT NULL,
    action text NOT NULL,
    target_type text NOT NULL,
    target_id text NOT NULL,
    diff jsonb NOT NULL,
    request_id text,
    prev_hash bytea,
    hash bytea NOT NULL UNIQUE
);
CREATE INDEX audit_log_occurred ON sbr.audit_log (occurred_at DESC);

CREATE FUNCTION sbr.audit_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only';
END;
$$;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON sbr.audit_log
    FOR EACH ROW EXECUTE FUNCTION sbr.audit_log_append_only();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON sbr.audit_log
    FOR EACH STATEMENT EXECUTE FUNCTION sbr.audit_log_append_only();
