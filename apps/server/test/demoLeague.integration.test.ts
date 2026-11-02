/**
 * @file   apps/server/test/demoLeague.integration.test.ts
 * @module server/test
 * @brief  The development demo league: ten verified accounts, three counting royales, removal.
 *
 * Responsibility: POST /api/v1/dev/demo-league makes demo-01 … demo-10 (e-mail confirmed) and
 *                 starts three royales among them (leaderboard switch on, no bots, timed draws);
 *                 their scheduled actions run in due order without the waits, so they finish
 *                 through the engine and fill both boards with 10 rows and the profiles with 3
 *                 matches. DELETE aborts a match still running, keeps the finished ones and
 *                 removes the accounts with their league and badge rows.
 * Depends on:     ./harness
 * Spec:           docs/spec/01-game-design.md §10; docs/spec/04-database-design.md §3.3
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startHarness, stopHarness, SUITE_TIMEOUT_MS, type Harness } from './harness.js';

let harness: Harness;

beforeAll(async () => {
  harness = await startHarness();
}, SUITE_TIMEOUT_MS);
afterAll(async () => {
  await stopHarness(harness);
}, SUITE_TIMEOUT_MS);

const call = (method: 'GET' | 'POST' | 'DELETE', url: string) =>
  harness.built.fastify.inject({ method, url });

interface ActionRow {
  readonly id: string;
  readonly kind: 'draw';
  readonly payload: { readonly drawIndex?: number };
}

// Runs the match's pending scheduled actions in due order, as the scheduler would, without
// waiting for their time, until it has finished.
async function runToEnd(matchId: string): Promise<void> {
  for (let i = 0; i < 2_000; i += 1) {
    const m = await harness.built.match.engine.runner.current(matchId);
    if (m.record.status === 'finished') return;
    const next = await harness.pool.query<ActionRow>(
      `UPDATE sbr.scheduled_actions SET done_at = now()
        WHERE id = (SELECT id FROM sbr.scheduled_actions
                     WHERE match_id = $1 AND done_at IS NULL ORDER BY due_at, id LIMIT 1)
        RETURNING id, kind, payload`,
      [matchId],
    );
    const row = next.rows[0];
    if (row === undefined) throw new Error('nothing scheduled, but the match is not over');
    await harness.built.match.engine.handle({
      matchId,
      kind: row.kind,
      dueAt: Date.now(),
      ...(row.payload.drawIndex === undefined ? {} : { drawIndex: row.payload.drawIndex }),
    });
  }
  throw new Error('the match did not end');
}

const idOf = async (code: string) =>
  (await harness.pool.query<{ id: string }>('SELECT id FROM sbr.matches WHERE code = $1', [code]))
    .rows[0]?.id ?? '';

describe('the demo league (development only)', () => {
  let codes: string[] = [];

  it('plays three counting royales among ten verified demo accounts', async () => {
    const made = await call('POST', '/api/v1/dev/demo-league');
    expect(made.statusCode).toBe(202);
    codes = made.json<{ matches: string[] }>().matches;
    expect(codes).toHaveLength(3);
    const accounts = await harness.pool.query(
      `SELECT 1 FROM sbr.accounts WHERE display_name LIKE 'demo-%' AND email_verified_at IS NOT NULL`,
    );
    expect(accounts.rowCount).toBe(10);
    for (const code of codes.slice(0, 2)) await runToEnd(await idOf(code));
    const periods = (await call('GET', '/api/v1/leaderboards')).json<{
      items: { id: string }[];
    }>().items;
    for (const period of periods) {
      const board = (await call('GET', `/api/v1/leaderboards/${period.id}`)).json<{
        items: { displayName: string }[];
      }>();
      expect(board.items).toHaveLength(10);
    }
    const profile = (await call('GET', '/api/v1/players/demo-01')).json<{
      matchesPlayed: number;
    }>();
    expect(profile.matchesPlayed).toBe(2);
  });

  it('removes the accounts, aborts the match still running and keeps the finished ones', async () => {
    const removed = await call('DELETE', '/api/v1/dev/demo-league');
    expect(removed.json()).toMatchObject({ aborted: 1 });
    expect(removed.json<{ removed: string[] }>().removed).toHaveLength(10);
    const statuses = await harness.pool.query<{ code: string; status: string }>(
      'SELECT code, status FROM sbr.matches WHERE code = ANY($1) ORDER BY code',
      [codes],
    );
    expect(statuses.rows.map((r) => r.status).sort()).toEqual(['aborted', 'finished', 'finished']);
    const left = await harness.pool.query(
      `SELECT 1 FROM sbr.accounts WHERE display_name LIKE 'demo-%'
       UNION ALL SELECT 1 FROM sbr.league_entries UNION ALL SELECT 1 FROM sbr.badges_awarded`,
    );
    expect(left.rowCount).toBe(0);
  });
});
