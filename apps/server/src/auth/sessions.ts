/**
 * @file   apps/server/src/auth/sessions.ts
 * @module server/auth
 * @brief  Session rows: create, look up by cookie token, touch, revoke (03 §3).
 *
 * Responsibility: a session id is 32 random bytes sent in the cookie; the database keeps
 *                 only its SHA-256. Each session carries a synchronizer CSRF token (03 §8).
 *                 Lookup loads the account's display name and permissions (via role
 *                 assignments; a guest session gets the guest role's permissions) and
 *                 refuses revoked, expired and idle-expired sessions. Idle 7 days, absolute
 *                 30 days for players and guests; idle 30 minutes, absolute 8 hours for
 *                 accounts with an admin role. Dead sessions are purged by the retention job.
 * Depends on:     node:crypto, ../db/pool
 * Used by:        ./sessionPlugin, ../http/routes/auth, ../http/routes/devSignIn, ../realtime/gateway,
 *                 ../match/retention
 * Spec:           docs/spec/03-security-architecture.md §3, §8; docs/spec/04-database-design.md §3.1
 */
import { createHash, randomBytes } from 'node:crypto';

import type { DbPool } from '../db/pool.js';

// Accounts with any of these roles get admin sessions: idle 30 minutes, absolute 8 hours
// (03 §3); players and guests idle 7 days, absolute 30 days.
const ADMIN_ROLES = ['super_admin', 'security_admin', 'game_admin', 'moderator'];

export type SessionKind = 'player' | 'admin' | 'guest';

export interface Session {
  readonly id: string;
  readonly accountId: string | null;
  readonly kind: SessionKind;
  readonly csrfToken: string;
  readonly displayName: string | null;
  readonly permissions: readonly string[];
}

export function tokenHash(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

export async function createSession(
  pool: DbPool,
  accountId: string | null,
  userAgent: string | null,
): Promise<{ readonly token: string; readonly csrfToken: string }> {
  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(32).toString('base64url');
  await pool.query(
    `INSERT INTO sbr.sessions (account_id, token_hash, csrf_token, kind, expires_at, idle_expires_at, user_agent)
     SELECT $1, $2, $3, k.kind,
       now() + CASE k.kind WHEN 'admin' THEN interval '8 hours' ELSE interval '30 days' END,
       now() + CASE k.kind WHEN 'admin' THEN interval '30 minutes' ELSE interval '7 days' END, $4
     FROM (SELECT CASE
       WHEN $1::uuid IS NULL THEN 'guest'
       WHEN EXISTS (SELECT 1 FROM sbr.role_assignments ra
                     WHERE ra.account_id = $1::uuid AND ra.role_id = ANY($5)) THEN 'admin'
       ELSE 'player' END AS kind) k`,
    [accountId, tokenHash(token), csrfToken, userAgent, ADMIN_ROLES],
  );
  return { token, csrfToken };
}

interface SessionRow {
  id: string;
  account_id: string | null;
  kind: SessionKind;
  csrf_token: string;
  display_name: string | null;
  permissions: string[] | null;
}

// Loads a live session and slides its idle expiry. Unknown or dead tokens give null.
export async function findSession(pool: DbPool, token: string): Promise<Session | null> {
  const result = await pool.query<SessionRow>(
    `UPDATE sbr.sessions s SET last_seen_at = now(),
       idle_expires_at = now() + CASE s.kind WHEN 'admin' THEN interval '30 minutes' ELSE interval '7 days' END
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL
         AND s.expires_at > now() AND s.idle_expires_at > now()
     RETURNING s.id, s.account_id, s.kind, s.csrf_token,
       (SELECT a.display_name FROM sbr.accounts a WHERE a.id = s.account_id AND a.status = 'active') AS display_name,
       (SELECT array_agg(DISTINCT rp.permission) FROM sbr.role_permissions rp
          WHERE rp.role_id = 'guest' AND s.account_id IS NULL
             OR rp.role_id IN (SELECT ra.role_id FROM sbr.role_assignments ra WHERE ra.account_id = s.account_id)
       ) AS permissions`,
    [tokenHash(token)],
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  // A suspended or deleted account has no display name here: treat it as signed out.
  if (row.account_id !== null && row.display_name === null) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    kind: row.kind,
    csrfToken: row.csrf_token,
    displayName: row.display_name,
    permissions: row.permissions ?? [],
  };
}

export async function revokeSession(pool: DbPool, sessionId: string): Promise<void> {
  await pool.query('UPDATE sbr.sessions SET revoked_at = now() WHERE id = $1', [sessionId]);
}

// The ids of an account's sessions (their sockets close when the account is deleted).
export async function accountSessionIds(pool: DbPool, accountId: string): Promise<string[]> {
  const r = await pool.query<{ id: string }>('SELECT id FROM sbr.sessions WHERE account_id = $1', [
    accountId,
  ]);
  return r.rows.map((row) => row.id);
}

// Revoked and expired sessions are deleted by the daily retention job (audit S3).
export async function purgeDeadSessions(pool: DbPool): Promise<number> {
  const result = await pool.query(
    'DELETE FROM sbr.sessions WHERE revoked_at IS NOT NULL OR expires_at < now() OR idle_expires_at < now()',
  );
  return result.rowCount ?? 0;
}
