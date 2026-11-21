/**
 * @file   apps/server/src/admin/settings.ts
 * @module server/admin
 * @brief  The settings store: versioned documents the admin area changes and the server reads.
 *
 * Responsibility: each document (`sbr.settings_documents`) holds its values as one JSON object;
 *                 every change writes a new version (`sbr.settings_versions`: who, when, the
 *                 comment) and moves `current_version`, nothing is overwritten, and the same
 *                 transaction writes the audit entry (./audit). Undo writes a new version in
 *                 which the values the undone change touched are back as they were before it
 *                 ("Undo of version N", admin-area §6, §8 (k)); later changes to other values
 *                 stay. The server keeps the current documents in memory, loaded at start and
 *                 replaced on every change, so a change applies at once without a restart.
 *                 Values a document leaves out come from the environment (§8 (p): it is only
 *                 the first default). Built-in documents (the presets, ./presets) are seeded as
 *                 version 1; a duplicated preset is a new document, audited.
 * Depends on:     @sbr/contracts (readPath, writePath), ../db/pool (types), ./audit
 * Used by:        ../http/app, ../http/routes/adminSettings, ./presets, ../config/features
 * Spec:           docs/concepts/admin-area.md §6, §8 (k), (p); docs/spec/04-database-design.md §3.2
 */
import { readPath, writePath } from '@sbr/contracts';
import type pg from 'pg';

import type { DbPool } from '../db/pool.js';
import { appendAudit } from './audit.js';

export type SettingsDocument = Readonly<Record<string, unknown>>;

export interface SettingsChange {
  readonly documentId: string;
  readonly next: SettingsDocument;
  readonly actorAccountId: string;
  readonly comment: string | null;
  readonly requestId: string | null;
}

export interface SettingsUndo {
  readonly documentId: string;
  readonly undone: number;
  readonly actorAccountId: string;
  readonly requestId: string | null;
  // A last check of the document the undo would write (a preset must stay a valid one).
  readonly accept?: (document: SettingsDocument) => boolean;
}

// Every path to a value that is not an object or array ("ruleset.stages.0.rounds").
function leafPaths(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') return prefix === '' ? [] : [prefix];
  return Object.entries(value).flatMap(([key, v]) =>
    leafPaths(v, prefix === '' ? key : `${prefix}.${key}`),
  );
}

// The documents the server reads at runtime, in memory: loaded at start, replaced on change.
export class SettingsStore {
  private readonly current = new Map<string, SettingsDocument>();

  constructor(private readonly pool: DbPool) {}

  async load(): Promise<void> {
    const rows = await this.pool.query<{ id: string; document: SettingsDocument }>(
      `SELECT d.id, v.document FROM sbr.settings_documents d
         JOIN sbr.settings_versions v ON v.document_id = d.id AND v.version = d.current_version`,
    );
    for (const r of rows.rows) this.current.set(r.id, r.document);
  }

  get(documentId: string): SettingsDocument {
    return this.current.get(documentId) ?? {};
  }

  // A new version with `next` as its content; the old and new values go to the audit log.
  async change(c: SettingsChange): Promise<number> {
    const version = await this.inTransaction(async (client) => {
      const before = await currentOf(client, c.documentId);
      const v = before.version + 1;
      await insertVersion(client, { ...c, version: v });
      await appendAudit(client, {
        actorAccountId: c.actorAccountId,
        action: 'settings.change',
        targetType: 'settings',
        targetId: `${c.documentId}@${String(v)}`,
        diff: { from: before.document, to: c.next, comment: c.comment },
        requestId: c.requestId,
      });
      return v;
    });
    this.current.set(c.documentId, c.next);
    return version;
  }

  // Undo of version N: a new version in which each value version N changed (nested values
  // one by one, so a preset's other rules stay) is back to what it was before N; values changed
  // later by other versions stay (never a delete). 'nothing' when there is no such version or
  // nothing is left to undo; 'refused' when `accept` turns the result down.
  async undo(u: SettingsUndo): Promise<number | 'nothing' | 'refused'> {
    const pair = await this.pool.query<{ version: number; document: SettingsDocument }>(
      `SELECT version, document FROM sbr.settings_versions
        WHERE document_id = $1 AND version IN ($2, $2 - 1)`,
      [u.documentId, u.undone],
    );
    const before = pair.rows.find((r) => r.version === u.undone - 1)?.document;
    const after = pair.rows.find((r) => r.version === u.undone)?.document;
    if (before === undefined || after === undefined) return 'nothing';
    let next: unknown = this.get(u.documentId);
    for (const path of new Set([...leafPaths(before), ...leafPaths(after)])) {
      const was = JSON.stringify(readPath(before, path));
      if (was === JSON.stringify(readPath(after, path))) continue;
      if (JSON.stringify(readPath(next, path)) === was) continue;
      next = writePath(next, path, readPath(before, path));
    }
    if (next === this.get(u.documentId)) return 'nothing';
    // Through JSON, so a value back to "left out" is gone rather than undefined.
    const document = JSON.parse(JSON.stringify(next)) as SettingsDocument;
    if (u.accept !== undefined && !u.accept(document)) return 'refused';
    return this.change({
      documentId: u.documentId,
      next: document,
      actorAccountId: u.actorAccountId,
      comment: `Undo of version ${String(u.undone)}`,
      requestId: u.requestId,
    });
  }

  // The current documents whose id starts with `prefix` (the presets: `preset:`).
  documents(prefix: string): [string, SettingsDocument][] {
    return [...this.current].filter(([id]) => id.startsWith(prefix));
  }

  // A document the server ships (a built-in preset): written as version 1 unless it exists;
  // not an admin's change, so no audit entry.
  async seed(documentId: string, document: SettingsDocument): Promise<void> {
    await this.inTransaction(async (client) => {
      const made = await client.query(
        'INSERT INTO sbr.settings_documents (id) VALUES ($1) ON CONFLICT DO NOTHING',
        [documentId],
      );
      if (made.rowCount === 0) return;
      await client.query(
        `INSERT INTO sbr.settings_versions (document_id, version, document, comment)
         VALUES ($1, 1, $2, 'Built in')`,
        [documentId, JSON.stringify(document)],
      );
      this.current.set(documentId, document);
    });
  }

  // A new document (a duplicated preset): version 1, audited like a change from nothing.
  async create(c: SettingsChange): Promise<void> {
    await this.inTransaction(async (client) => {
      await client.query('INSERT INTO sbr.settings_documents (id) VALUES ($1)', [c.documentId]);
      await insertVersion(client, { ...c, version: 1 });
      await appendAudit(client, {
        actorAccountId: c.actorAccountId,
        action: 'settings.change',
        targetType: 'settings',
        targetId: `${c.documentId}@1`,
        diff: { from: {}, to: c.next, comment: c.comment },
        requestId: c.requestId,
      });
    });
    this.current.set(c.documentId, c.next);
  }

  private async inTransaction<T>(run: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await run(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

// The document's current version, locked until the transaction ends (one change at a time).
async function currentOf(
  client: pg.PoolClient,
  documentId: string,
): Promise<{ version: number; document: SettingsDocument }> {
  const r = await client.query<{ version: number; document: SettingsDocument }>(
    `SELECT d.current_version AS version, v.document FROM sbr.settings_documents d
       JOIN sbr.settings_versions v ON v.document_id = d.id AND v.version = d.current_version
      WHERE d.id = $1 FOR UPDATE OF d`,
    [documentId],
  );
  const row = r.rows[0];
  if (row === undefined) throw new Error(`no settings document ${documentId}`);
  return row;
}

// The new version and the document's pointer to it.
async function insertVersion(
  client: pg.PoolClient,
  c: SettingsChange & { readonly version: number },
): Promise<void> {
  await client.query(
    `INSERT INTO sbr.settings_versions (document_id, version, document, created_by, comment)
     VALUES ($1, $2, $3, $4, $5)`,
    [c.documentId, c.version, JSON.stringify(c.next), c.actorAccountId, c.comment],
  );
  await client.query('UPDATE sbr.settings_documents SET current_version = $2 WHERE id = $1', [
    c.documentId,
    c.version,
  ]);
}
