/**
 * @file   apps/server/src/auth/websiteAccounts.ts
 * @module server/auth
 * @brief  Website mode: the game account of a website user, by (issuer, subject) (D37, 07 §2.1).
 *
 * Responsibility: in one transaction: the website's identity provider (created at its first
 *                 sign-in; a disabled one refuses), the external identity and its account —
 *                 created without password or e-mail on the first sign-in, with the `player`
 *                 role —, the display name following the website's (a numeric suffix when
 *                 another account has it), the mapped roles recomputed (`idp_mapping`; never an
 *                 admin role), the e-mail verification mirrored for league points, the last
 *                 sign-in. A suspended game account is refused. Never links by e-mail.
 * Depends on:     ../db/pool, ./websiteIdentity
 * Used by:        ../http/routes/websiteSignIn
 * Spec:           docs/spec/07-integration-architecture.md §2.1, §2.3; docs/spec/04-database-design.md §3.1
 */
import type { PoolClient } from 'pg';

import type { DbPool } from '../db/pool.js';
import { mappedRoles, type WebsiteIdentity } from './websiteIdentity.js';

interface Linked {
  readonly account_id: string;
  readonly status: string;
  readonly last_claims: { readonly name?: string };
}

async function providerId(client: PoolClient, issuer: string): Promise<string | null> {
  const r = await client.query<{ id: string; enabled: boolean }>(
    `INSERT INTO sbr.identity_providers (kind, name, issuer)
       VALUES ('proxy_header', 'Seasonal Entertainment website', $1)
     ON CONFLICT (issuer) DO UPDATE SET issuer = EXCLUDED.issuer RETURNING id, enabled`,
    [issuer],
  );
  const row = r.rows[0];
  return row?.enabled === true ? row.id : null;
}

// The wanted name, else with 2, 3, … at its end (cut to stay within 24 characters).
async function freeName(client: PoolClient, wanted: string, self: string | null): Promise<string> {
  for (let n = 1; n < 1000; n += 1) {
    const suffix = n === 1 ? '' : String(n);
    const candidate = `${wanted.slice(0, 24 - suffix.length)}${suffix}`;
    const taken = await client.query<{ id: string }>(
      'SELECT id FROM sbr.accounts WHERE display_name_key = $1',
      [candidate],
    );
    const holder = taken.rows[0]?.id;
    if (holder === undefined || holder === self) return candidate;
  }
  throw new Error('no free display name');
}

async function createLinked(
  client: PoolClient,
  provider: string,
  who: WebsiteIdentity,
): Promise<string> {
  const name = await freeName(client, who.displayName, null);
  const created = await client.query<{ id: string }>(
    `INSERT INTO sbr.accounts (display_name, display_name_key) VALUES ($1, $2) RETURNING id`,
    [name, name],
  );
  const id = created.rows[0]?.id ?? '';
  await client.query(
    `INSERT INTO sbr.role_assignments (account_id, role_id) VALUES ($1, 'player')`,
    [id],
  );
  await client.query(
    'INSERT INTO sbr.external_identities (account_id, provider_id, subject) VALUES ($1, $2, $3)',
    [id, provider, who.subject],
  );
  return id;
}

// What the website says now: name (when it changed), mapped roles, e-mail verification.
async function follow(client: PoolClient, id: string, who: WebsiteIdentity, before: Linked | null) {
  if (before !== null && before.last_claims.name !== who.websiteName) {
    const name = await freeName(client, who.displayName, id);
    await client.query(
      'UPDATE sbr.accounts SET display_name = $2, display_name_key = $3 WHERE id = $1',
      [id, name, name],
    );
  }
  await client.query(
    `DELETE FROM sbr.role_assignments WHERE account_id = $1 AND source = 'idp_mapping'`,
    [id],
  );
  for (const role of mappedRoles(who.roles)) {
    await client.query(
      `INSERT INTO sbr.role_assignments (account_id, role_id, source) VALUES ($1, $2, 'idp_mapping')
       ON CONFLICT DO NOTHING`,
      [id, role],
    );
  }
  await client.query(
    `UPDATE sbr.accounts SET last_login_at = now(), updated_at = now(),
       email_verified_at = CASE WHEN $2 THEN COALESCE(email_verified_at, now()) END
     WHERE id = $1`,
    [id, who.emailVerified],
  );
  await client.query(
    `UPDATE sbr.external_identities SET last_claims = $2::jsonb WHERE account_id = $1`,
    [id, JSON.stringify({ name: who.websiteName, roles: who.roles })],
  );
}

// The account the website user signs in to, or null when refused (the provider is disabled
// or the game account is suspended).
export async function websiteAccount(
  pool: DbPool,
  issuer: string,
  who: WebsiteIdentity,
): Promise<string | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const provider = await providerId(client, issuer);
    if (provider === null) {
      await client.query('ROLLBACK');
      return null;
    }
    const found = await client.query<Linked>(
      `SELECT e.account_id, a.status, e.last_claims FROM sbr.external_identities e
         JOIN sbr.accounts a ON a.id = e.account_id
        WHERE e.provider_id = $1 AND e.subject = $2 FOR UPDATE`,
      [provider, who.subject],
    );
    const before = found.rows[0] ?? null;
    if (before !== null && before.status !== 'active') {
      await client.query('ROLLBACK');
      return null;
    }
    const id = before?.account_id ?? (await createLinked(client, provider, who));
    await follow(client, id, who, before);
    await client.query('COMMIT');
    return id;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
