/**
 * @file   apps/server/test/loadCheck.integration.test.ts
 * @module server/test
 * @brief  The operator's load check (`sbr loadcheck`, 12 §5): when it may run, its accounts, its cleanup.
 *
 * Responsibility: the check refuses while someone is signed in and maintenance is off, and while
 *                 a real player is in a match that is not over, saying why; with maintenance on
 *                 and no match open it may run. Its accounts (no e-mail, no password, role
 *                 load_check) work through the real app with the cookies it hands out: the host
 *                 creates and starts its royale while maintenance is on, which a normal host may
 *                 not. The cleanup aborts that match (never deletes it), removes every load
 *                 account with its sessions and finds nothing left. The real accounts the test
 *                 signs in are removed at the end.
 * Depends on:     vitest, ../src/auth/accounts, ../src/loadcheck/accounts, ./harness, ./session
 * Spec:           docs/spec/12-testing-strategy.md §5; docs/spec/01-game-design.md §8 (D22)
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { deleteAccount } from '../src/auth/accounts.js';
import {
  createLoadAccounts,
  loadCheckRefusal,
  removeLoadCheck,
  type LoadClient,
} from '../src/loadcheck/accounts.js';
import { startHarness, stopHarness, SUITE_TIMEOUT_MS, type Harness } from './harness.js';
import { signIn, type Client } from './session.js';

const data = mkdtempSync(path.join(tmpdir(), 'sbr-loadcheck-'));
let h: Harness;
const ROYALE = {
  title: 'Load check',
  gameType: 'royale',
  drawMode: 'host',
  missedNumbers: { kind: 'noAutoMark' },
  maxPlayers: 200,
};

beforeAll(async () => {
  h = await startHarness({ SBR_DATA_DIR: data });
}, SUITE_TIMEOUT_MS);
afterAll(async () => {
  const real = await h.pool.query<{ id: string }>(
    `SELECT id FROM sbr.accounts WHERE display_name LIKE 'dev-%'`,
  );
  for (const { id } of real.rows) await deleteAccount(h.pool, id);
  await stopHarness(h);
  rmSync(data, { recursive: true, force: true });
}, SUITE_TIMEOUT_MS);

// A request as a load account, with the cookie and CSRF token the CLI handed out.
function as(client: LoadClient, url: string, body: unknown = {}): Promise<LightMyRequestResponse> {
  return h.built.fastify.inject({
    method: 'POST',
    url,
    payload: body as object,
    headers: { cookie: client.cookie, 'x-csrf-token': client.csrf },
  });
}

const maintenance = (on: boolean): void => {
  if (on) writeFileSync(path.join(data, 'maintenance'), 'Load check');
  else rmSync(path.join(data, 'maintenance'), { force: true });
};

describe('when the load check may run (12 §5)', () => {
  let host: Client;

  it('refuses while someone is signed in and maintenance is off', async () => {
    expect(await loadCheckRefusal(h.pool, false)).toBeNull();
    host = await signIn(h.built.fastify, 'host');
    expect(await loadCheckRefusal(h.pool, false)).toMatch(/signed in and maintenance is off/);
    expect(await loadCheckRefusal(h.pool, true)).toBeNull();
  });

  it('refuses while a real player is in a match that is not over', async () => {
    const player = await signIn(h.built.fastify, 'player-1');
    const { code } = (await host.post('/api/v1/matches', ROYALE)).json<{ code: string }>();
    expect((await player.post(`/api/v1/matches/${code}/join`, {})).statusCode).toBe(204);
    expect(await loadCheckRefusal(h.pool, true)).toMatch(/in a match that is not over/);
    expect((await host.post(`/api/v1/matches/${code}/abort`, { reason: 'test' })).statusCode).toBe(
      200,
    );
    expect(await loadCheckRefusal(h.pool, true)).toBeNull();
  });
});

describe('the load accounts and their cleanup (12 §5)', () => {
  it('play a royale under maintenance, and leave nothing behind', async () => {
    const made = await createLoadAccounts(h.pool, { players: 2, spectators: 1 }, 'sbr_session');
    expect(made.players.map((p) => p.name)).toEqual(['loadcheck-001', 'loadcheck-002']);
    expect(made.spectators.map((p) => p.name)).toEqual(['loadcheck-003']);
    const noLogin = await h.pool.query(
      `SELECT 1 FROM sbr.accounts WHERE display_name LIKE 'loadcheck-%'
          AND (email IS NOT NULL OR password_hash IS NOT NULL)`,
    );
    expect(noLogin.rowCount).toBe(0);
    maintenance(true);
    try {
      // The app looks at the flag at most every 2 seconds.
      const on = async () => (await h.built.fastify.inject('/api/v1/maintenance')).json<unknown>();
      await expect.poll(on, { timeout: 3_000 }).toEqual({ on: true, reason: 'Load check' });
      const normal = await signIn(h.built.fastify, 'host');
      expect((await normal.post('/api/v1/matches', ROYALE)).statusCode).toBe(503);
      const created = await as(made.host, '/api/v1/matches', ROYALE);
      expect(created.statusCode).toBe(201);
      const { code } = created.json<{ code: string }>();
      for (const p of made.players) {
        expect((await as(p, `/api/v1/matches/${code}/join`)).statusCode).toBe(204);
      }
      expect((await as(made.host, `/api/v1/matches/${code}/start`)).statusCode).toBe(200);
      const removed = await removeLoadCheck(h.pool, h.built.match.engine);
      expect(removed).toEqual({
        aborted: 1,
        removed: 4,
        left: { accounts: 0, sessions: 0, matches: 0 },
      });
      const status = await h.pool.query<{ status: string }>(
        'SELECT status FROM sbr.matches WHERE code = $1',
        [code],
      );
      expect(status.rows[0]?.status).toBe('aborted');
    } finally {
      maintenance(false);
    }
  });
});
