/**
 * @file   apps/server/src/admin/audit.ts
 * @module server/admin
 * @brief  The audit log: one append-only, hash-chained entry per change made in the admin area.
 *
 * Responsibility: `recordAudit` writes who (account id and its roles at the time), what (action,
 *                 target, the change as JSON), when and the request id, inside one transaction
 *                 that holds an advisory lock, so entries chain in order: each stores the hash
 *                 of the entry before it and its own (`entryHash`, SHA-256 over the previous
 *                 hash and the entry with its JSON keys sorted). The table refuses UPDATE and
 *                 DELETE (migration 0020); the app role may only INSERT and SELECT. No IP address
 *                 is stored (docs/PRIVACY-DATA.md).
 * Depends on:     node:crypto, ../db/pool (types)
 * Used by:        ../http/routes/admin
 * Spec:           docs/concepts/admin-area.md §6; docs/spec/04-database-design.md §3
 */
import { createHash } from 'node:crypto';

import type { DbPool } from '../db/pool.js';

export interface AuditEntry {
  readonly actorAccountId: string | null;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly diff: Readonly<Record<string, unknown>>;
  readonly requestId: string | null;
}

// One lock id for the whole log: entries are written one at a time, in chain order.
const CHAIN_LOCK = 724_501;

// JSON with every object's keys sorted, so a hash does not depend on key order (jsonb
// stores keys in its own order).
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export interface StoredFields extends AuditEntry {
  // Milliseconds since the epoch: what the database gives back exactly (timestamptz).
  readonly occurredAtMs: number;
  readonly actorRoles: readonly string[];
}

// SHA-256 over the previous entry's hash (none for the first) and this entry's fields.
export function entryHash(prev: Buffer | null, e: StoredFields): Buffer {
  const body = stable([
    e.occurredAtMs,
    e.actorAccountId,
    e.actorRoles,
    e.action,
    e.targetType,
    e.targetId,
    e.diff,
    e.requestId,
  ]);
  return createHash('sha256')
    .update(prev ?? Buffer.alloc(0))
    .update(body)
    .digest();
}

export async function recordAudit(pool: DbPool, entry: AuditEntry): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [CHAIN_LOCK]);
    const last = await client.query<{ hash: Buffer }>(
      'SELECT hash FROM sbr.audit_log ORDER BY id DESC LIMIT 1',
    );
    const roles = await client.query<{ roles: string[] }>(
      `SELECT coalesce(array_agg(role_id ORDER BY role_id), '{}') AS roles
         FROM sbr.role_assignments WHERE account_id = $1`,
      [entry.actorAccountId],
    );
    const fields: StoredFields = {
      ...entry,
      occurredAtMs: Date.now(),
      actorRoles: roles.rows[0]?.roles ?? [],
    };
    const prev = last.rows[0]?.hash ?? null;
    await client.query(
      `INSERT INTO sbr.audit_log (occurred_at, actor_account_id, actor_roles, action, target_type,
         target_id, diff, request_id, prev_hash, hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        new Date(fields.occurredAtMs),
        fields.actorAccountId,
        fields.actorRoles,
        fields.action,
        fields.targetType,
        fields.targetId,
        JSON.stringify(fields.diff),
        fields.requestId,
        prev,
        entryHash(prev, fields),
      ],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
