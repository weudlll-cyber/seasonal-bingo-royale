/**
 * @file   apps/server/src/auth/sessions.ts
 * @module server/auth
 * @brief  Session rows: create, look up by cookie token, touch, revoke (03 §3).
 *
 * Responsibility: a session id is 32 random bytes sent in the cookie; the database keeps
 *                 only its SHA-256. Each session carries a synchronizer CSRF token (03 §8).
 *                 Lookup (by cookie token, or by session id for a socket's host intents)
 *                 loads the account's display name and permissions (via role
 *                 assignments; a guest session gets the guest role's permissions) and
 *                 refuses revoked, expired and idle-expired sessions; a local admin account's
 *                 session has no permissions until its second step (TOTP, D60). Idle 7 days, absolute
 *                 30 days for players and guests (7 days after a website sign-in); idle 30 minutes, absolute 8 hours for
 *                 accounts with an admin role. Dead sessions are purged by the retention job.
 * Depends on:     ../db/pool
 * Used by:        ./sessionPlugin, ../http/routes/auth, ../http/routes/devSignIn, ../realtime/gateway,
 *                 ../realtime/intents, ../match/retention
 * Spec:           docs/spec/03-security-architecture.md §3, §8; docs/spec/04-database-design.md §3.1
 */
import { createHash, randomBytes } from 'node:crypto';

import type { DbPool } from '../db/pool.js';

// Accounts with any of these roles get admin sessions: idle 30 minutes, absolute 8 hours
// (03 §3); players and guests idle 7 days, absolute 30 days.
const ADMIN_ROLES = ['super_admin', 'security_admin', 'game_admin', 'moderator'];

type SessionKind = 'player' | 'admin' | 'guest';

export interface Session {
  readonly id: string;
  readonly accountId: string | null;
  readonly kind: SessionKind;
  readonly csrfToken: string;
  readonly displayName: string | null;
  readonly permissions: readonly string[];
  // A local admin account's session before its second step (TOTP, D60): no permissions yet.
  readonly twoFactorPending: boolean;
}

function tokenHash(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

// A player or guest session's absolute lifetime: 30 days, in website mode 7 days from the
// website sign-in (2026-11-04); admin sessions keep 8 hours either way.
export async function createSession(
  pool: DbPool,
  accountId: string | null,
  userAgent: string | null,
  playerDays = 30,
): Promise<{ readonly token: string; readonly csrfToken: string }> {
  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(32).toString('base64url');
  await pool.query(
    `INSERT INTO sbr.sessions (account_id, token_hash, csrf_token, kind, expires_at, idle_expires_at, user_agent)
     SELECT $1, $2, $3, k.kind,
       now() + CASE k.kind WHEN 'admin' THEN interval '8 hours' ELSE make_interval(days => $6) END,
       now() + CASE k.kind WHEN 'admin' THEN interval '30 minutes' ELSE interval '7 days' END, $4
     FROM (SELECT CASE
       WHEN $1::uuid IS NULL THEN 'guest'
       WHEN EXISTS (SELECT 1 FROM sbr.role_assignments ra
                     WHERE ra.account_id = $1::uuid AND ra.role_id = ANY($5)) THEN 'admin'
       ELSE 'player' END AS kind) k`,
    [accountId, tokenHash(token), csrfToken, userAgent, ADMIN_ROLES, playerDays],
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
  two_factor_pending: boolean;
}

// A session token as createSession makes it: 32 random bytes in base64url (43 characters).
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

// Loads a live session and slides its idle expiry. Unknown or dead tokens give null; a cookie
// that cannot be a token gives null before any database work (audit-3 S5).
export async function findSession(pool: DbPool, token: string): Promise<Session | null> {
  if (!TOKEN_FORMAT.test(token)) return null;
  return liveSession(pool, 's.token_hash', tokenHash(token));
}

// The same checks by session id, for a socket that holds a session loaded at connect: a
// host intent re-reads it, so an expired or revoked session or a lost role counts at once.
export async function refreshSession(pool: DbPool, sessionId: string): Promise<Session | null> {
  return liveSession(pool, 's.id', sessionId);
}

async function liveSession(
  pool: DbPool,
  by: 's.token_hash' | 's.id',
  key: Buffer | string,
): Promise<Session | null> {
  const result = await pool.query<SessionRow>(
    `UPDATE sbr.sessions s SET last_seen_at = now(),
       idle_expires_at = now() + CASE s.kind WHEN 'admin' THEN interval '30 minutes' ELSE interval '7 days' END
       WHERE ${by} = $1 AND s.revoked_at IS NULL
         AND s.expires_at > now() AND s.idle_expires_at > now()
     RETURNING s.id, s.account_id, s.kind, s.csrf_token,
       (SELECT a.display_name FROM sbr.accounts a WHERE a.id = s.account_id AND a.status = 'active') AS display_name,
       (SELECT array_agg(DISTINCT rp.permission) FROM sbr.role_permissions rp
          WHERE rp.role_id = 'guest' AND s.account_id IS NULL
             OR rp.role_id IN (SELECT ra.role_id FROM sbr.role_assignments ra WHERE ra.account_id = s.account_id)
       ) AS permissions,
       -- An admin session of an account with a password (local, never a website account)
       -- waits for its second step (D60).
       (s.kind = 'admin' AND s.last_2fa_at IS NULL AND EXISTS (SELECT 1 FROM sbr.accounts p
          WHERE p.id = s.account_id AND p.password_hash IS NOT NULL)) AS two_factor_pending`,
    [key],
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
    permissions: row.two_factor_pending ? [] : (row.permissions ?? []),
    twoFactorPending: row.two_factor_pending,
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
