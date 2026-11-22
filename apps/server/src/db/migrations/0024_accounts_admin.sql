-- @file   apps/server/src/db/migrations/0024_accounts_admin.sql
-- @brief  Players and accounts (admin-area §9 piece 8): who may administer accounts.
--
-- Responsibility: the Admin roles (game_admin, super_admin) may find accounts, give and remove
--                 the Organizer role, lock and unlock, reset an account's second step and end
--                 its sessions (`accounts.manage`); only the owner may give and remove the Admin
--                 role (`admins.manage`, admin-area §2). Standalone only: in website mode the
--                 website decides accounts and roles (D41, D46) and the routes do not exist.
-- Spec:           docs/concepts/admin-area.md §2, §4 (Players and accounts), §9 piece 8

INSERT INTO sbr.role_permissions (role_id, permission) VALUES
    ('game_admin', 'accounts.manage'),
    ('super_admin', 'accounts.manage'),
    ('super_admin', 'admins.manage');
