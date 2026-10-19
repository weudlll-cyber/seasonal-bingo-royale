/**
 * @file   apps/server/src/db/migrator.ts
 * @module server/db
 * @brief  SQL migration runner. Reads .sql files from migrations/, applies in order.
 *
 * Responsibility: apply pending migrations under a single transaction each, record the
 *                 result in sbr.schema_migrations (name + sha256 + applied_at). Reject a
 *                 migration whose checksum no longer matches the recorded one — a published
 *                 migration file is immutable (10 §2, 04 §6).
 * Depends on:     pg, node:fs, node:crypto
 * Used by:        ../main.ts, test/*
 * Spec:           docs/spec/04-database-design.md §6, docs/spec/02-software-architecture.md §7
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import type { DbPool } from './pool.js';

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

interface MigrationFile {
  readonly id: string;
  readonly checksum: string;
  readonly sql: string;
}

export async function migrate(pool: DbPool): Promise<readonly string[]> {
  await ensureMigrationsTable(pool);
  const files = listMigrations();
  const applied = await loadApplied(pool);
  const newlyApplied: string[] = [];
  for (const file of files) {
    const recorded = applied.get(file.id);
    if (recorded === undefined) {
      await applyOne(pool, file);
      newlyApplied.push(file.id);
      continue;
    }
    if (recorded !== file.checksum) {
      throw new Error(
        `migration ${file.id} has changed since it was applied: checksum ${recorded} on disk ${file.checksum}`,
      );
    }
  }
  return newlyApplied;
}

async function ensureMigrationsTable(pool: DbPool): Promise<void> {
  // The migrations table lives in the sbr schema (04 §1); creating the schema is also
  // the first migration's job, but we need the bootstrap row for 0001 itself.
  await pool.query('CREATE SCHEMA IF NOT EXISTS sbr');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sbr.schema_migrations (
      id text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function loadApplied(pool: DbPool): Promise<Map<string, string>> {
  const result = await pool.query<{ id: string; checksum: string }>(
    'SELECT id, checksum FROM sbr.schema_migrations',
  );
  return new Map(result.rows.map((row) => [row.id, row.checksum]));
}

function listMigrations(): readonly MigrationFile[] {
  const names = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  return names.map((name) => {
    const sql = readFileSync(path.join(migrationsDir, name), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    return { id: name, checksum, sql };
  });
}

async function applyOne(pool: DbPool, file: MigrationFile): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(file.sql);
    await client.query('INSERT INTO sbr.schema_migrations (id, checksum) VALUES ($1, $2)', [
      file.id,
      file.checksum,
    ]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
