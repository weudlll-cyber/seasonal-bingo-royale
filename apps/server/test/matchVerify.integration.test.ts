/**
 * @file   apps/server/test/matchVerify.integration.test.ts
 * @module server/test
 * @brief  "Verify this match": the seed is revealed after the end, never before (HTTP and WS).
 *
 * Responsibility: a classic match played to its end over the engine: before the start and
 *                 while it runs, GET /verify answers 409 MATCH_NOT_OVER; afterwards it
 *                 reveals the seed whose sha256 is the stored commitment, and the server's
 *                 recomputation equals the played match (every draw in the log, every card
 *                 dealt). No socket frame and no state answer sent before the end carries
 *                 the seed. A cancelled match reveals its seed too. The route has its own
 *                 limit: 20 calls a minute per address, then 429 RATE_LIMITED.
 * Depends on:     node:crypto, vitest, ./socketKit
 * Spec:           docs/spec/01-game-design.md §9; docs/spec/05-api-design.md §2.3a
 */
import { createHash } from 'node:crypto';

import type { MatchVerificationView } from '@sbr/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SUITE_TIMEOUT_MS } from './harness.js';
import { startSocketKit, type SocketKit } from './socketKit.js';

let kit: SocketKit;

beforeAll(async () => {
  kit = await startSocketKit();
}, SUITE_TIMEOUT_MS);
afterAll(async () => {
  await kit.close();
}, SUITE_TIMEOUT_MS);

// Draws and closes speed windows straight through the engine until the match has ended.
async function playToEnd(id: string): Promise<void> {
  const engine = kit.harness.built.match.engine;
  for (let i = 0; i < 200; i += 1) {
    const m = await engine.runner.current(id);
    if (m.record.status === 'finished') return;
    await engine.handle({ matchId: id, kind: 'draw', dueAt: Date.now() });
    const drawIndex = ((await engine.runner.current(id)).state.currentRound?.draws.length ?? 0) - 1;
    await engine.handle({ matchId: id, kind: 'close_speed_window', dueAt: Date.now(), drawIndex });
  }
  throw new Error('the match did not end');
}

async function logged(id: string, type: string): Promise<Record<string, unknown>[]> {
  const r = await kit.harness.pool.query<{ payload: Record<string, unknown> }>(
    'SELECT payload FROM sbr.match_events WHERE match_id = $1 AND type = $2 ORDER BY seq',
    [id, type],
  );
  return r.rows.map((row) => row.payload);
}

// The ways a seed could travel in JSON: hex, base64, a byte list (an array or a Buffer's
// `data`), a typed array's `{"0":…}` object, or any `seed` field that is not empty.
function leaks(text: string, seed: Buffer): string[] {
  const bytes = [...seed];
  const forms = {
    hex: seed.toString('hex'),
    base64: seed.toString('base64'),
    byteList: bytes.join(','),
    byteObject: bytes.map((b, i) => `"${String(i)}":${String(b)}`).join(','),
  };
  const found = Object.entries(forms).flatMap(([name, form]) =>
    text.includes(form) ? [name] : [],
  );
  const filled = /"seed":(?!\{\}|\[\]|""|\{"type":"Buffer","data":\[\]\})/.test(text);
  return filled ? [...found, 'seed field'] : found;
}

describe('verify this match (01 §9)', () => {
  it('reveals the seed only after the end, and the recomputation equals the played match', async () => {
    const code = await kit.createMatch('host');
    expect((await kit.player.post(`/api/v1/matches/${code}/join`, {})).statusCode).toBe(204);
    await kit.host.post(`/api/v1/matches/${code}/bots`, { upTo: 4 });
    const watcher = kit.open(kit.player.cookie);
    await kit.connected(watcher);
    const frames: unknown[] = [];
    watcher.onAny((_name: string, ...args: unknown[]) => frames.push(args));
    expect((await kit.send(watcher, 'match.watch', { code })).ok).toBe(true);
    const notYet = await kit.player.get(`/api/v1/matches/${code}/verify`);
    expect([notYet.statusCode, notYet.json<{ code: string }>().code]).toEqual([
      409,
      'MATCH_NOT_OVER',
    ]);
    const id = (await kit.host.get(`/api/v1/matches/${code}`)).json<{ id: string }>().id;
    const engine = kit.harness.built.match.engine;
    await engine.start(id, 0);
    await engine.handle({ matchId: id, kind: 'start_match', dueAt: Date.now() });
    await engine.handle({ matchId: id, kind: 'draw', dueAt: Date.now() });
    expect((await kit.host.get(`/api/v1/matches/${code}/verify`)).statusCode).toBe(409);
    const runningState = (await kit.player.get(`/api/v1/matches/${code}/state`)).body;
    await playToEnd(id);
    const sentBeforeEnd = JSON.stringify(frames) + runningState;

    const answer = await kit.player.get(`/api/v1/matches/${code}/verify`);
    expect(answer.statusCode).toBe(200);
    const v = answer.json<MatchVerificationView>();
    expect(v.verified).toBe(true);
    expect(v.status).toBe('finished');
    // The revealed seed is the committed one: sha256(seed) is the commitment stored at open.
    const stored = await kit.harness.pool.query<{ seed_commitment: Buffer }>(
      'SELECT seed_commitment FROM sbr.matches WHERE id = $1',
      [id],
    );
    expect(v.commitment).toBe(stored.rows[0]?.seed_commitment.toString('hex'));
    const seed = Buffer.from(v.seed, 'hex');
    expect(createHash('sha256').update(seed).digest('hex')).toBe(v.commitment);
    // Every draw in the log, every card dealt.
    const draws = (await logged(id, 'drawMade')).map((e) => e['item']);
    expect(v.rounds.flatMap((r) => r.draws)).toEqual(draws);
    const dealt = (await logged(id, 'roundStarted')).map(
      (e) => Object.values(e['cardsByPlayer'] as Record<string, unknown[]>).flat().length,
    );
    expect(v.rounds.map((r) => r.cardsChecked)).toEqual(dealt);
    expect(v.rounds.every((r) => r.drawOrderMatches && r.drawsMatch && r.cardsMatch)).toBe(true);
    // Nothing sent before the end carried the seed, in any form.
    expect(leaks(sentBeforeEnd, seed)).toEqual([]);
  }, 120_000);
});

describe('verify: a cancelled match, an unknown code', () => {
  it('reveals the seed of a cancelled match', async () => {
    const code = await kit.createMatch('host');
    expect(
      (await kit.host.post(`/api/v1/matches/${code}/abort`, { reason: 'test' })).statusCode,
    ).toBe(200);
    const v = (
      await kit.player.get(`/api/v1/matches/${code}/verify`)
    ).json<MatchVerificationView>();
    expect(v).toMatchObject({
      status: 'aborted',
      commitmentMatches: true,
      rounds: [],
      verified: true,
    });
  });

  it('answers 404 for an unknown code', async () => {
    expect((await kit.player.get('/api/v1/matches/NOPE99/verify')).statusCode).toBe(404);
  });
});

// Runs last in this file: it uses up this address's verify budget.
describe('verify: its own rate limit (03 §13)', () => {
  it('answers 429 RATE_LIMITED after 20 calls a minute from one address', async () => {
    const answers = [];
    for (let i = 0; i < 25; i += 1) {
      answers.push(await kit.player.get('/api/v1/matches/NOPE99/verify'));
    }
    const limited = answers.filter((a) => a.statusCode === 429);
    expect(answers.length - limited.length).toBeLessThanOrEqual(20);
    expect(limited.length).toBeGreaterThan(0);
    expect(limited[0]?.json<{ code: string }>().code).toBe('RATE_LIMITED');
  });
});
