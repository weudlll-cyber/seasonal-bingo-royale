/**
 * @file   apps/server/test/dbRoles.integration.test.ts
 * @module server/test
 * @brief  The owner and app roles of a production database (audit-3 S1): who may do what.
 *
 * Responsibility: an install made before the roles (migrated by the superuser) is converted by
 *                 ops/kit/lib/db-roles.sql; a fresh database gets the same layout. The owner migrates
 *                 and grants the app role (`cli migrate`). The app role plays a whole match through
 *                 the real app, but is refused UPDATE, DELETE and TRUNCATE on the event log, audit
 *                 log, settings versions and league corrections (by permission, not only by
 *                 triggers), turning a trigger off, writing the migration record, creating or
 *                 dropping tables and creating roles; the owner cannot create roles either. The
 *                 match is finished in the throw-away database; accounts go with the container.
 * Depends on:     vitest, @testcontainers/postgresql, ../src/index, ../src/db/appRole, @seasonal/kit/server,
 *                 ./harness, ./session, ./playToEnd
 * Spec:           docs/spec/03-security-architecture.md §9; docs/spec/04-database-design.md §1, §3.3
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { grantAppRole } from '@seasonal/kit/server';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { APP_ROLE_GRANTS } from '../src/db/appRole.js';
import { createPool, migrate, type DbPool } from '../src/index.js';
import { buildOn, SUITE_TIMEOUT_MS } from './harness.js';
import { playToEnd } from './playToEnd.js';
import { signIn } from './session.js';

const ROLES_SQL = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../ops/kit/lib/db-roles.sql'),
  'utf8',
);
const OWNER_PASSWORD = 'a1'.repeat(24);
const APP_PASSWORD = 'b2'.repeat(24);

let container: StartedPostgreSqlContainer;
const pools: DbPool[] = [];

// A pool on `database` as `user` (the superuser when no password is given).
function poolOf(database: string, user?: string, password?: string): { pool: DbPool; url: string } {
  const url = new URL(container.getConnectionUri());
  url.pathname = `/${database}`;
  if (user !== undefined && password !== undefined) {
    url.username = user;
    url.password = password;
  }
  const pool = createPool(url.toString());
  pools.push(pool);
  return { pool, url: url.toString() };
}

// What `sbr` sends to psql (the kit's sk_db_roles_apply): the script with Bingo's names and
// the env file's passwords.
async function applyRoles(superuser: DbPool): Promise<void> {
  const words = {
    __SCHEMA__: 'sbr',
    __OWNER__: 'sbr_owner',
    __APP__: 'sbr_app',
    __OWNER_PASSWORD__: OWNER_PASSWORD,
    __APP_PASSWORD__: APP_PASSWORD,
  };
  const sql = Object.entries(words).reduce(
    (text, [word, value]) => text.replaceAll(word, value),
    ROLES_SQL,
  );
  await superuser.query(sql);
}

// The error a statement fails with, or null.
async function refusal(pool: DbPool, sql: string): Promise<string | null> {
  try {
    await pool.query(sql);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

// A classic match with bots, created and played to its end by an app on `pool`; its status.
async function playedAs(pool: DbPool, url: string): Promise<string | undefined> {
  const built = await buildOn(pool, url);
  try {
    const host = await signIn(built.fastify, 'host');
    const created = await host.post('/api/v1/matches', {
      title: 'Roles match',
      gameType: 'classic',
      prizes: ['fullCard'],
      drawMode: 'host',
      missedNumbers: { kind: 'noAutoMark' },
      maxPlayers: 8,
    });
    const { id } = created.json<{ id: string }>();
    const engine = built.match.engine;
    await engine.fillWithBots(id, 4);
    await engine.start(id, 0);
    await engine.handle({ matchId: id, kind: 'start_match', dueAt: Date.now() });
    await playToEnd(engine, id);
    const status = await pool.query<{ status: string }>(
      'SELECT status FROM sbr.matches WHERE id = $1',
      [id],
    );
    return status.rows[0]?.status;
  } finally {
    await built.fastify.close();
  }
}

// UPDATE, DELETE and TRUNCATE refused by permission (not only by the table's trigger), and the
// trigger cannot be turned off: the app role does not own the table.
async function expectAppendOnly(app: DbPool, table: string, column: string): Promise<void> {
  for (const sql of [
    `UPDATE sbr.${table} SET ${column} = ${column} WHERE false`,
    `DELETE FROM sbr.${table} WHERE false`,
    `TRUNCATE sbr.${table}`,
  ]) {
    expect(await refusal(app, sql)).toMatch(new RegExp(`permission denied for table ${table}`));
  }
  expect(await refusal(app, `ALTER TABLE sbr.${table} DISABLE TRIGGER ALL`)).toMatch(
    /must be owner/,
  );
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
}, SUITE_TIMEOUT_MS);
afterAll(async () => {
  for (const pool of pools) await pool.end();
  await container.stop();
}, SUITE_TIMEOUT_MS);

describe('an install made before the roles, converted (S1)', () => {
  let app: DbPool;
  let appUrl: string;

  beforeAll(async () => {
    const database = container.getDatabase();
    const superuser = poolOf(database).pool;
    await migrate(superuser);
    await applyRoles(superuser);
    // Idempotent: the update may run it on every start of the stack.
    await applyRoles(superuser);
    const owner = poolOf(database, 'sbr_owner', OWNER_PASSWORD).pool;
    expect(await migrate(owner)).toEqual([]);
    expect(await grantAppRole(owner, APP_ROLE_GRANTS)).toBe(true);
    ({ pool: app, url: appUrl } = poolOf(database, 'sbr_app', APP_PASSWORD));
  }, SUITE_TIMEOUT_MS);

  it('lets the app play a whole match through the real app', async () => {
    expect(await playedAs(app, appUrl)).toBe('finished');
  });

  it('refuses the app changing or removing match events, audit entries, settings versions and league corrections', async () => {
    await expectAppendOnly(app, 'match_events', 'seq');
    await expectAppendOnly(app, 'audit_log', 'action');
    await expectAppendOnly(app, 'settings_versions', 'comment');
    await expectAppendOnly(app, 'league_corrections', 'reason');
    expect(await refusal(app, "DELETE FROM sbr.schema_migrations WHERE id = 'x'")).toMatch(
      /permission denied/,
    );
  });

  it('refuses the app changing the schema or the roles', async () => {
    expect(await refusal(app, 'CREATE TABLE sbr.extra (id int)')).toMatch(/permission denied/);
    expect(await refusal(app, 'CREATE SCHEMA extra')).toMatch(/permission denied/);
    expect(await refusal(app, 'DROP TABLE sbr.accounts')).toMatch(/must be owner/);
    expect(await refusal(app, 'ALTER TABLE sbr.accounts ADD COLUMN x int')).toMatch(
      /must be owner/,
    );
    expect(await refusal(app, 'CREATE ROLE intruder')).toMatch(/permission denied/);
  });

  it('refuses the owner creating roles', async () => {
    const owner = poolOf(container.getDatabase(), 'sbr_owner', OWNER_PASSWORD).pool;
    expect(await refusal(owner, 'CREATE ROLE intruder')).toMatch(/permission denied/);
  });
});

describe('a fresh install with the roles (S1)', () => {
  it('lets the owner apply every migration and grant the app', async () => {
    const superuser = poolOf(container.getDatabase()).pool;
    await superuser.query('CREATE DATABASE fresh');
    await applyRoles(poolOf('fresh').pool);
    const owner = poolOf('fresh', 'sbr_owner', OWNER_PASSWORD).pool;
    expect((await migrate(owner)).length).toBeGreaterThan(10);
    expect(await grantAppRole(owner, APP_ROLE_GRANTS)).toBe(true);
    const app = poolOf('fresh', 'sbr_app', APP_PASSWORD).pool;
    expect((await app.query('SELECT count(*) FROM sbr.accounts')).rows).toHaveLength(1);
    expect(await refusal(app, 'DELETE FROM sbr.match_events WHERE false')).toMatch(
      /permission denied/,
    );
  });
});
