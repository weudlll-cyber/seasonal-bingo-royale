/**
 * @file   apps/server/src/db/appRole.ts
 * @module server/db
 * @brief  What the app's database role may do on the game's tables (kit K90).
 *
 * Responsibility: the grants the owner gives after every migration through the kit's
 *                 `grantAppRole`: the role `sbr_app` (a production install makes it,
 *                 ops/kit/lib/db-roles.sql) reads and writes the rows of the schema `sbr`, never
 *                 changes or removes a match event, an audit entry, a settings version or a league
 *                 correction (append-only, 04 §3.3, admin-area §6), and only reads the migration
 *                 record. Without the role (development, the test suites) nothing is granted.
 * Depends on:     @seasonal/kit/server (type)
 * Used by:        ../cli (migrate), test/dbRoles.integration.test.ts
 * Spec:           docs/spec/03-security-architecture.md §9; docs/spec/04-database-design.md §1, §3.3
 */
import type { AppRoleGrants } from '@seasonal/kit/server';

export const APP_ROLE_GRANTS: AppRoleGrants = {
  schema: 'sbr',
  role: 'sbr_app',
  appendOnly: ['match_events', 'audit_log', 'settings_versions', 'league_corrections'],
  readOnly: ['schema_migrations'],
};
