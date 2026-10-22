/**
 * @file   apps/server/src/auth/accounts.ts
 * @module server/auth
 * @brief  Local accounts: register, find for login, ensure dev accounts (03 §2.1, WP-09).
 *
 * Responsibility: create an account with the `player` role (and any extra roles), look an
 *                 account up by e-mail for login, and create-or-reuse the development
 *                 accounts behind the quick sign-in. E-mail and display name are unique
 *                 case-insensitively; a clash is reported as one generic error so the
 *                 response never reveals which e-mail exists.
 * Depends on:     ../db/pool, ./password
 * Used by:        ../http/routes/auth, ../http/routes/devSignIn
 * Spec:           docs/spec/03-security-architecture.md §2.1; docs/spec/04-database-design.md §3.1
 */
import type { DbPool } from '../db/pool.js';
import { hashPassword } from './password.js';

export interface NewAccount {
  readonly email: string;
  readonly displayName: string;
  readonly password: string;
  readonly roles?: readonly string[];
}

export type RegisterResult = { readonly ok: true; readonly id: string } | { readonly ok: false };

export async function registerAccount(pool: DbPool, input: NewAccount): Promise<RegisterResult> {
  const passwordHash = await hashPassword(input.password);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO sbr.accounts (email, password_hash, display_name, display_name_key)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id`,
      [input.email, passwordHash, input.displayName, input.displayName],
    );
    const id = inserted.rows[0]?.id;
    if (id === undefined) {
      await client.query('ROLLBACK');
      return { ok: false };
    }
    for (const role of ['player', ...(input.roles ?? [])]) {
      await client.query('INSERT INTO sbr.role_assignments (account_id, role_id) VALUES ($1, $2)', [
        id,
        role,
      ]);
    }
    await client.query('COMMIT');
    return { ok: true, id };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export interface LoginAccount {
  readonly id: string;
  readonly passwordHash: string | null;
  readonly emailVerified: boolean;
}

export async function findLoginAccount(pool: DbPool, email: string): Promise<LoginAccount | null> {
  const result = await pool.query<{
    id: string;
    password_hash: string | null;
    email_verified_at: Date | null;
  }>(
    `SELECT id, password_hash, email_verified_at FROM sbr.accounts WHERE email = $1 AND status = 'active'`,
    [email],
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  return {
    id: row.id,
    passwordHash: row.password_hash,
    emailVerified: row.email_verified_at !== null,
  };
}

export async function passwordHashOf(pool: DbPool, accountId: string): Promise<string | null> {
  const result = await pool.query<{ password_hash: string | null }>(
    'SELECT password_hash FROM sbr.accounts WHERE id = $1',
    [accountId],
  );
  return result.rows[0]?.password_hash ?? null;
}

// Deletes an account (05 §2.2 DELETE /me): its sessions and roles go with it (cascade); the
// matches it hosted or played keep their history without the link to the account.
export async function deleteAccount(pool: DbPool, accountId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE sbr.matches SET created_by = NULL WHERE created_by = $1', [
      accountId,
    ]);
    await client.query('UPDATE sbr.match_entries SET account_id = NULL WHERE account_id = $1', [
      accountId,
    ]);
    await client.query('DELETE FROM sbr.accounts WHERE id = $1', [accountId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function recordLogin(pool: DbPool, accountId: string): Promise<void> {
  await pool.query('UPDATE sbr.accounts SET last_login_at = now() WHERE id = $1', [accountId]);
}

// Development only: the account behind a quick sign-in button, created on first use.
export async function ensureDevAccount(
  pool: DbPool,
  displayName: string,
  roles: readonly string[],
): Promise<string> {
  const found = await pool.query<{ id: string }>(
    'SELECT id FROM sbr.accounts WHERE display_name_key = $1',
    [displayName],
  );
  const existing = found.rows[0]?.id;
  if (existing !== undefined) return existing;
  const created = await registerAccount(pool, {
    email: `${displayName}@dev.invalid`,
    displayName,
    password: `${displayName}-dev-only-password`,
    roles,
  });
  if (!created.ok) throw new Error(`could not create dev account ${displayName}`);
  return created.id;
}
