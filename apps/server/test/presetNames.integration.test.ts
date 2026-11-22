/**
 * @file   apps/server/test/presetNames.integration.test.ts
 * @module server/test
 * @brief  Migration 0026: built-in presets still named by their key get the names of a new install.
 *
 * Responsibility: a built-in preset whose name equals its key (a database seeded by an early
 *                 build) is renamed ("royale-realtime" → "Battle royale") as a new version,
 *                 never by changing a stored version; a preset an admin renamed keeps its name;
 *                 running the migration again changes nothing.
 * Depends on:     vitest, node:fs, ./harness
 * Spec:           docs/concepts/admin-area.md §6, §9 piece 3
 */
import { readFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startHarness, stopHarness, SUITE_TIMEOUT_MS, type Harness } from './harness.js';

let h: Harness;

beforeAll(async () => {
  h = await startHarness();
}, SUITE_TIMEOUT_MS);

afterAll(async () => {
  await stopHarness(h);
}, SUITE_TIMEOUT_MS);

const MIGRATION = readFileSync(
  new URL('../src/db/migrations/0026_preset_names.sql', import.meta.url),
  'utf8',
);

// A new version of a preset with another name (as an early seed or an admin left it).
async function nameAs(id: string, name: string): Promise<void> {
  await h.pool.query(
    `WITH cur AS (
       SELECT d.current_version AS v, sv.document AS doc FROM sbr.settings_documents d
         JOIN sbr.settings_versions sv ON sv.document_id = d.id AND sv.version = d.current_version
        WHERE d.id = $1),
     ins AS (
       INSERT INTO sbr.settings_versions (document_id, version, document)
       SELECT $1, v + 1, jsonb_set(doc, '{name}', to_jsonb($2::text)) FROM cur RETURNING version)
     UPDATE sbr.settings_documents SET current_version = (SELECT version FROM ins) WHERE id = $1`,
    [id, name],
  );
}

const current = async (id: string) =>
  (
    await h.pool.query<{ name: string; version: number }>(
      `SELECT sv.document->>'name' AS name, d.current_version AS version
         FROM sbr.settings_documents d
         JOIN sbr.settings_versions sv ON sv.document_id = d.id AND sv.version = d.current_version
        WHERE d.id = $1`,
      [id],
    )
  ).rows[0];

describe('the built-in presets get their names (migration 0026)', () => {
  it('renames a preset still named by its key, as a new version, and leaves a renamed one', async () => {
    await nameAs('preset:royale-realtime', 'royale-realtime');
    await nameAs('preset:classic-realtime', 'Club classic');
    const before = await current('preset:royale-realtime');
    await h.pool.query(MIGRATION);
    const after = await current('preset:royale-realtime');
    expect(after).toEqual({ name: 'Battle royale', version: (before?.version ?? 0) + 1 });
    expect((await current('preset:classic-realtime'))?.name).toBe('Club classic');
    await h.pool.query(MIGRATION);
    expect(await current('preset:royale-realtime')).toEqual(after);
  });
});
