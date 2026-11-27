/**
 * @file   e2e/testDatabase.ts
 * @module e2e
 * @brief  The tests' own databases: made empty, thrown away; never the development one (kit K125).
 *
 * Responsibility: `freshDatabase(name)` drops the database of that name if a run left it and
 *                 creates it empty on the tests' PostgreSQL (./devStack), answering its URL;
 *                 `dropDatabase(name)` throws it away, open connections and all. `runSql` is one
 *                 statement through the server package's pg (the e2e package has none). Only names
 *                 starting `sbr_e2e` are made or dropped, and the statements run from the
 *                 server's `postgres` database, so nothing here can touch the development one.
 *                 Nothing is copied into a test database: the server's migrations fill it.
 * Depends on:     node:child_process, node:path, ./devStack
 * Used by:        ./testServer, ./globalTeardown, ./websiteStack
 * Spec:           docs/spec/12-testing-strategy.md §4
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { databaseUrl, REPO_ROOT } from './devStack.js';

const SERVER_DIR = path.join(REPO_ROOT, 'apps/server');
const OWN = /^sbr_e2e[a-z0-9_]*$/;

// SQL outside any request.
export function runSql(url: string, statement: string): void {
  const code = `import pg from 'pg'; const c = new pg.Client(${JSON.stringify(url)});
    await c.connect(); try { await c.query(${JSON.stringify(statement)}); }
    finally { await c.end(); }`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: SERVER_DIR,
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`sql failed: ${r.stderr}`);
}

export function dropDatabase(name: string): void {
  if (!OWN.test(name)) throw new Error(`not a test database: ${name}`);
  runSql(databaseUrl('postgres'), `DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
}

export function freshDatabase(name: string): string {
  dropDatabase(name);
  runSql(databaseUrl('postgres'), `CREATE DATABASE ${name}`);
  return databaseUrl(name);
}
