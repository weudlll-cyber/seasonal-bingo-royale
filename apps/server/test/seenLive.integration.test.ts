/**
 * @file   apps/server/test/seenLive.integration.test.ts
 * @module server/test
 * @brief  Draws a player watched live do not bring back "new" in My matches (D54).
 *
 * Responsibility: in an asynchronous royale, player-1 opens the match (away summary) and keeps
 *                 it open on a socket in the match room while a day of draws happens: the
 *                 server records the steps as seen, so `mine` has no "new". With the socket
 *                 closed, further draws bring the marker back; opening the match (the away
 *                 summary) clears it again, and the summary still names what was missed. The
 *                 match is aborted at the end (./harness stopHarness via the kit).
 * Depends on:     vitest, ./socketKit, ./harness
 * Spec:           docs/spec/06-realtime-architecture.md §6; docs/spec/01-game-design.md §13 (D54)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SUITE_TIMEOUT_MS } from './harness.js';
import { startSocketKit, type SocketKit } from './socketKit.js';

const DAY = 86_400_000;
let kit: SocketKit;

beforeAll(async () => {
  kit = await startSocketKit();
}, SUITE_TIMEOUT_MS);
afterAll(async () => {
  await kit.close();
}, SUITE_TIMEOUT_MS);

const newsOf = async (code: string) =>
  (await kit.player.get('/api/v1/matches'))
    .json<{ mine: { code: string; news: boolean }[] }>()
    .mine.find((m) => m.code === code)?.news;

const travel = async (code: string) => {
  const r = await kit.host.post('/api/v1/dev/time-travel', { code, ms: DAY });
  expect(r.statusCode).toBe(200);
};

describe('steps watched live count as seen (D54)', () => {
  it('keeps "new" away while the match is open, and brings it back once it is not', async () => {
    const created = await kit.host.post('/api/v1/matches', {
      title: 'Watched',
      gameType: 'royale',
      drawMode: 'auto',
      missedNumbers: { kind: 'noAutoMark' },
      maxPlayers: 10,
      mode: 'async',
      quietHours: null,
    });
    const { code, id } = created.json<{ code: string; id: string }>();
    expect((await kit.player.post(`/api/v1/matches/${code}/join`, {})).statusCode).toBe(204);
    const engine = kit.harness.built.match.engine;
    await engine.fillWithBots(id, 10);
    await engine.start(id, 0);
    // Opening the match: the away summary, then the live room.
    expect((await kit.player.get(`/api/v1/matches/${code}/away-summary`)).statusCode).toBe(200);
    const socket = kit.open(kit.player.cookie);
    expect(await kit.connected(socket)).toBe('ok');
    expect((await kit.send(socket, 'match.watch', { code })).ok).toBe(true);
    await travel(code);
    // Every step sent (the server says so), and the seen seqs written now instead of after 10 s.
    await kit.harness.built.live.settled(id);
    await kit.harness.built.live.seenNow();
    expect(await newsOf(code)).toBe(false);
    socket.disconnect();
    await travel(code);
    expect(await newsOf(code)).toBe(true);
    const away = await kit.player.get(`/api/v1/matches/${code}/away-summary`);
    expect(away.json<{ summary: { draws: number } | null }>().summary?.draws).toBeGreaterThan(0);
    expect(await newsOf(code)).toBe(false);
  }, 120_000);
});
