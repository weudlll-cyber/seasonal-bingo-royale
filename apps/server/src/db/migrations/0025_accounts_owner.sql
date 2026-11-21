-- @file   apps/server/src/db/migrations/0025_accounts_owner.sql
-- @brief  Players and accounts: what only the owner may do (owner decision of 2026-11-21).
--
-- Responsibility: every Admin may find accounts, give and remove the Organizer role, lock and
--                 unlock and end sessions (`accounts.manage`, 0024); only the owner
--                 (`super_admin`) may reset an account's second step (`twofactor.reset`) and see
--                 e-mail addresses in the search (`accounts.email`), as well as give and remove
--                 the Admin role (`admins.manage`, 0024).
-- Spec:           docs/concepts/admin-area.md §2, §4 (Players and accounts), §8 (t)

INSERT INTO sbr.role_permissions (role_id, permission) VALUES
    ('super_admin', 'twofactor.reset'),
    ('super_admin', 'accounts.email');
