/**
 * @file   apps/server/test/seedAtRest.integration.test.ts
 * @module server/test
 * @brief  Match secrets stay encrypted at rest: the seed and the draw order never sit readable in the database.
 *
 * Responsibility: a running classic match with bots, read straight from PostgreSQL: its
 *                 lobbyOpened and roundStarted rows and its snapshots hold neither the seed
 *                 nor the round's draw order in any plain form; a second server on the same
 *                 database (a restart mid-match) reads them back and its next draw is the
 *                 next number of the round's order; a server with another seed key refuses
 *                 to start instead of failing later; the backup drill's check opens the
 *                 newest sealed seed with the suite's key only, and finds none to open
 *                 before any match exists.
 * Depends on:     node:crypto, vitest, ./harness, ./session, ../src/match/sealedSeedCheck
 * Spec:           docs/spec/03-security-architecture.md §9; docs/spec/04-database-design.md §3.3
 */
import { randomBytes } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { openOneSealedSeed } from '../src/match/sealedSeedCheck.js';
import {
  buildOn,
  startHarness,
  stopHarness,
  SUITE_TIMEOUT_MS,
  TEST_SEED_KEY,
  type Harness,
} from './harness.js';
import { signIn } from './session.js';

let harness: Harness;

beforeAll(async () => {
  harness = await startHarness();
}, SUITE_TIMEOUT_MS);
afterAll(async () => {
  await stopHarness(harness);
}, SUITE_TIMEOUT_MS);

// A started classic match with bots, drawn past the first snapshot (every 25 events).
async function runningMatch(): Promise<string> {
  const host = await signIn(harness.built.fastify, 'host');
  const created = await host.post('/api/v1/matches', {
    title: 'Secrets at rest',
    gameType: 'classic',
    prizes: ['fullCard'],
    drawMode: 'host',
    missedNumbers: { kind: 'noAutoMark' },
    maxPlayers: 8,
  });
  const { code, id } = created.json<{ code: string; id: string }>();
  await host.post(`/api/v1/matches/${code}/bots`, { upTo: 6 });
  const engine = harness.built.match.engine;
  await engine.start(id, 0);
  await engine.handle({ matchId: id, kind: 'start_match', dueAt: Date.now() });
  for (let i = 0; i < 12; i += 1) {
    await engine.handle({ matchId: id, kind: 'draw', dueAt: Date.now() });
    const drawIndex = ((await engine.runner.current(id)).state.currentRound?.draws.length ?? 0) - 1;
    await engine.handle({ matchId: id, kind: 'close_speed_window', dueAt: Date.now(), drawIndex });
  }
  return id;
}

async function rawRows(id: string): Promise<string[]> {
  const events = await harness.pool.query<{ text: string }>(
    `SELECT payload::text AS text FROM sbr.match_events
      WHERE match_id = $1 AND type IN ('lobbyOpened', 'roundStarted')`,
    [id],
  );
  const snapshots = await harness.pool.query<{ text: string }>(
    'SELECT state::text AS text FROM sbr.match_snapshots WHERE match_id = $1',
    [id],
  );
  expect(events.rows).toHaveLength(2);
  expect(snapshots.rows.length).toBeGreaterThan(0);
  return [...events.rows, ...snapshots.rows].map((r) => r.text);
}

// Every plain form the secrets could take in a stored row: the seed, and the numbers of
// the order not drawn yet (those already drawn are public: they are in every drawMade and
// in the state's draws). jsonb writes ", " between array items, the codec's own JSON ",".
function plainForms(seed: Buffer, order: readonly number[], drawn: number): string[] {
  const next = order.slice(drawn, drawn + 12);
  return [
    seed.toString('hex'),
    seed.toString('base64'),
    [...seed].join(','),
    [...seed].join(', '),
    next.join(','),
    next.join(', '),
  ];
}

// A second server on the same database stands for a restart (nothing in memory): it reads
// the sealed secrets back, and its next draw is the next number of the round's order.
async function checkRestart(
  id: string,
  seed: Buffer,
  order: readonly number[],
  draws: readonly number[],
): Promise<void> {
  const restarted = await buildOn(harness.pool, harness.container.getConnectionUri());
  try {
    const loaded = await restarted.match.store.load(id);
    expect(Buffer.from(loaded?.state.seed ?? [])).toEqual(seed);
    expect(loaded?.state.currentRound?.drawSequence).toEqual(order);
    expect(loaded?.state.currentRound?.draws).toEqual(draws);
    await restarted.match.engine.handle({ matchId: id, kind: 'draw', dueAt: Date.now() });
    const after = (await restarted.match.engine.runner.current(id)).state.currentRound;
    expect(after?.draws.at(-1)).toBe(order[draws.length]);
  } finally {
    await restarted.fastify.close();
  }
}

describe('match secrets at rest (03 §9)', () => {
  // First in the file, while the suite's database holds no match yet.
  it('reports no sealed seed to open on a database without matches', async () => {
    await expect(openOneSealedSeed(harness.pool, randomBytes(32))).resolves.toBe('none');
  });

  it('stores neither the seed nor the draw order readable, and a restart draws on', async () => {
    const id = await runningMatch();
    const { state } = await harness.built.match.engine.runner.current(id);
    const order = state.currentRound?.drawSequence ?? [];
    const draws = state.currentRound?.draws ?? [];
    const seed = Buffer.from(state.seed);
    expect(order.length).toBe(75);
    for (const text of await rawRows(id)) {
      for (const form of plainForms(seed, order, draws.length)) expect(text).not.toContain(form);
    }
    await checkRestart(id, seed, order, draws);
  }, 120_000);

  // The backup drill's proof (sbr restore --drill): the key opens one stored sealed seed.
  it('opens the newest sealed seed with the right key only', async () => {
    await expect(openOneSealedSeed(harness.pool, Buffer.from(TEST_SEED_KEY, 'hex'))).resolves.toBe(
      'opened',
    );
    await expect(openOneSealedSeed(harness.pool, randomBytes(32))).rejects.toThrow(
      'SBR_SEED_KEY does not open the stored match secrets',
    );
  });

  it('refuses to start with another seed key', async () => {
    const other = randomBytes(32).toString('hex');
    await expect(
      buildOn(harness.pool, harness.container.getConnectionUri(), { SBR_SEED_KEY: other }),
    ).rejects.toThrow('SBR_SEED_KEY does not open the stored match secrets');
  });
});
