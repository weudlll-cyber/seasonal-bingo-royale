/**
 * @file   apps/server/src/admin/accounts.ts
 * @module server/admin
 * @brief  Account administration: find accounts, roles, lock, second step reset, sessions.
 *
 * Responsibility: `findAccounts` — up to 20 accounts whose display name or e-mail starts with
 *                 the search (deleted ones never), with their roles, status, whether they have a
 *                 second step and when they last signed in. Each change runs in one transaction
 *                 with its audit entry (./audit) and ends the sessions it must: giving or
 *                 removing a role (`setRole`; the Admin role ends the account's sessions, so the
 *                 next sign-in is an admin session that asks for the second step, D60), locking
 *                 (`setLocked`: status suspended, every session ended) or unlocking, resetting
 *                 the second step (`resetSecondStep`: factor and recovery codes gone, sessions
 *                 ended, as `sbr admin reset-2fa`) and ending the sessions (`endSessions`). The
 *                 ended session ids are returned so the caller closes their sockets.
 * Depends on:     pg (types), ../db/pool (types), ./audit
 * Used by:        ../http/routes/adminAccounts
 * Spec:           docs/concepts/admin-area.md §2, §4 (Players and accounts), §6, §9 piece 8
 */
import type pg from 'pg';

import type { DbPool } from '../db/pool.js';
import { appendAudit } from './audit.js';

export interface AccountRow {
  readonly id: string;
  readonly displayName: string;
  readonly email: string | null;
  readonly roles: readonly string[];
  readonly status: 'active' | 'suspended';
  readonly secondStep: boolean;
  readonly lastLoginAt: number | null;
}

const LIST = 20;

export async function findAccounts(pool: DbPool, search: string): Promise<AccountRow[]> {
  const r = await pool.query<{
    id: string;
    display_name: string;
    email: string | null;
    roles: string[] | null;
    status: 'active' | 'suspended';
    second_step: boolean;
    last_login_at: Date | null;
  }>(
    `SELECT a.id, a.display_name, a.email, a.status, a.last_login_at,
            (SELECT array_agg(ra.role_id ORDER BY ra.role_id) FROM sbr.role_assignments ra
              WHERE ra.account_id = a.id) AS roles,
            EXISTS (SELECT 1 FROM sbr.totp_factors f WHERE f.account_id = a.id) AS second_step
       FROM sbr.accounts a
      WHERE a.status <> 'deleted'
        AND (a.display_name_key LIKE $1 OR a.email LIKE $1)
      ORDER BY a.display_name_key LIMIT ${String(LIST)}`,
    [`${search.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`],
  );
  return r.rows.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    roles: row.roles ?? [],
    status: row.status,
    secondStep: row.second_step,
    lastLoginAt: row.last_login_at?.getTime() ?? null,
  }));
}

export interface AccountChange {
  readonly accountId: string;
  readonly actorAccountId: string;
  readonly requestId: string | null;
}

// Runs `change` and the audit entry in one transaction; returns the sessions it ended.
async function changed(
  pool: DbPool,
  c: AccountChange,
  entry: { readonly action: string; readonly diff: Record<string, unknown> },
  change: (client: pg.PoolClient) => Promise<boolean>,
): Promise<readonly string[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const endSessions = await change(client);
    const ended = endSessions
      ? await client.query<{ id: string }>(
          `UPDATE sbr.sessions SET revoked_at = now()
            WHERE account_id = $1 AND revoked_at IS NULL RETURNING id`,
          [c.accountId],
        )
      : { rows: [] };
    await appendAudit(client, {
      actorAccountId: c.actorAccountId,
      action: entry.action,
      targetType: 'account',
      targetId: c.accountId,
      diff: entry.diff,
      requestId: c.requestId,
    });
    await client.query('COMMIT');
    return ended.rows.map((r) => r.id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export const setRole = (
  pool: DbPool,
  c: AccountChange & { readonly role: 'organizer' | 'game_admin'; readonly on: boolean },
) =>
  changed(
    pool,
    c,
    { action: c.on ? 'account.role.give' : 'account.role.remove', diff: { role: c.role } },
    async (client) => {
      await (c.on
        ? client.query(
            `INSERT INTO sbr.role_assignments (account_id, role_id, granted_by) VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
            [c.accountId, c.role, c.actorAccountId],
          )
        : client.query('DELETE FROM sbr.role_assignments WHERE account_id = $1 AND role_id = $2', [
            c.accountId,
            c.role,
          ]));
      return c.role === 'game_admin';
    },
  );

export const setLocked = (pool: DbPool, c: AccountChange & { readonly locked: boolean }) =>
  changed(
    pool,
    c,
    { action: c.locked ? 'account.lock' : 'account.unlock', diff: {} },
    async (client) => {
      await client.query(
        `UPDATE sbr.accounts SET status = $2 WHERE id = $1 AND status <> 'deleted'`,
        [c.accountId, c.locked ? 'suspended' : 'active'],
      );
      return c.locked;
    },
  );

export const resetSecondStep = (pool: DbPool, c: AccountChange) =>
  changed(pool, c, { action: 'account.reset2fa', diff: {} }, async (client) => {
    await client.query('DELETE FROM sbr.totp_factors WHERE account_id = $1', [c.accountId]);
    await client.query('DELETE FROM sbr.recovery_codes WHERE account_id = $1', [c.accountId]);
    return true;
  });

export const endSessions = (pool: DbPool, c: AccountChange) =>
  changed(pool, c, { action: 'account.endSessions', diff: {} }, () => Promise.resolve(true));
