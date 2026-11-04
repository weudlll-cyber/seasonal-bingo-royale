/**
 * @file   apps/server/src/db/roles.ts
 * @module server/db
 * @brief  The app role's rights on the game's tables, granted by the owner after the migrations.
 *
 * Responsibility: when the role `sbr_app` exists (a production install; ops/lib/db-roles.sql
 *                 makes it), the owner that just migrated lets it use the schema `sbr`, read and
 *                 write the rows of every table and use their sequences, but never change or
 *                 remove a match event (append-only, 04 §3.3) or the migration record: UPDATE,
 *                 DELETE and TRUNCATE on them are revoked on top of match_events' trigger. The
 *                 app role cannot create, alter or drop anything (it owns nothing and has no
 *                 CREATE). Without the role (development, the test suites) nothing is granted.
 * Depends on:     ./pool
 * Used by:        ../cli (migrate), test/dbRoles.integration.test.ts
 * Spec:           docs/spec/03-security-architecture.md §9; docs/spec/04-database-design.md §1, §3.3
 */
import type { DbPool } from './pool.js';

export const APP_ROLE = 'sbr_app';

// Run as the schema's owner: grants on objects it owns. Re-run after every migration, so a
// new table gets the same rights; idempotent.
const GRANTS = `
  GRANT USAGE ON SCHEMA sbr TO ${APP_ROLE};
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA sbr TO ${APP_ROLE};
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA sbr TO ${APP_ROLE};
  REVOKE UPDATE, DELETE, TRUNCATE ON sbr.match_events FROM ${APP_ROLE};
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON sbr.schema_migrations FROM ${APP_ROLE};
`;

// True when the app role exists and got its rights.
export async function grantAppRole(pool: DbPool): Promise<boolean> {
  const role = await pool.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [APP_ROLE]);
  if (role.rowCount === 0) return false;
  await pool.query(GRANTS);
  return true;
}
