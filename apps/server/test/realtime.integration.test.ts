/**
 * @file   apps/server/test/realtime.integration.test.ts
 * @module server/test
 * @brief  WebSocket gateway: auth, origin, rooms, events, intents, replay protection, limits (WP-11).
 *
 * Responsibility: against a listening server: sockets without a session or from a foreign
 *                 origin are refused; a watcher receives committed events in seq order, a
 *                 round start without cards or draw order, and draw-control changes; the host
 *                 draws and switches mode over the socket (D8), a player may not; a player
 *                 taps a drawn number; unwatch and watch sent back to back keep their order;
 *                 a repeated seq is dropped; marks are limited to 4 a second; a socket
 *                 watches at most 3 matches; the teardown aborts every match left open.
 *                 The match rules over the socket are in ./matchRules.integration.test.ts.
 * Depends on:     vitest, socket.io-client, ./harness, ./socketKit
 * Spec:           docs/spec/06-realtime-architecture.md §1–§5, §8; docs/spec/03-security-architecture.md §8, §13
 */
import type { Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { stopOpenMatches, SUITE_TIMEOUT_MS } from './harness.js';
import { startSocketKit, type SocketKit } from './socketKit.js';

let kit: SocketKit;

beforeAll(async () => {
  kit = await startSocketKit();
}, SUITE_TIMEOUT_MS);
afterAll(async () => {
  await kit.close();
}, SUITE_TIMEOUT_MS);

describe('handshake (06 §2)', () => {
  it('refuses a socket without a session and one from a foreign origin', async () => {
    expect(await kit.connected(kit.open(null))).toBe('UNAUTHORIZED');
    expect(await kit.connected(kit.open(kit.player.cookie, 'https://evil.example'))).toBe(
      'ORIGIN_NOT_ALLOWED',
    );
    expect(await kit.connected(kit.open(kit.player.cookie))).toBe('ok');
  });
});

// player-1's card cell holding the latest drawn number, or -1.
async function ownCellOfLastDraw(id: string): Promise<number> {
  const round = (await kit.harness.built.match.engine.runner.current(id)).state.currentRound;
  if (round === null) return -1;
  const me = Object.keys(round.cards).find((p) => !p.startsWith('bot-')) ?? '';
  const item = round.draws.at(-1);
  const cells = round.cards[me]?.[0]?.card.cells ?? [];
  return cells.findIndex((c) => c.kind !== 'free' && c.value === item);
}

// The host draws (closing each window by hand) until a number on player-1's card comes,
// then player-1 taps it over the socket. Returns whether the tap was accepted.
async function tapOwnNumber(playerSocket: Socket, code: string, id: string): Promise<boolean> {
  const engine = kit.harness.built.match.engine;
  for (let i = 0; i < 40; i += 1) {
    const cell = await ownCellOfLastDraw(id);
    if (cell >= 0) return (await kit.send(playerSocket, 'mark', { code, cardIndex: 0, cell })).ok;
    const drawIndex = ((await engine.runner.current(id)).state.currentRound?.draws.length ?? 0) - 1;
    if (drawIndex >= 0) {
      await engine.handle({
        matchId: id,
        kind: 'close_speed_window',
        dueAt: Date.now(),
        drawIndex,
      });
    }
    // The scheduler's timed draw, straight through the engine: draw.next over the socket
    // is limited to 2 a second and waits the timed interval (D13).
    await engine.handle({ matchId: id, kind: 'draw', dueAt: Date.now() });
  }
  return false;
}

describe('rooms, events and intents', () => {
  it('lets the host draw over the socket and the watcher receive events in order', async () => {
    const code = await kit.createMatch('host');
    expect((await kit.player.post(`/api/v1/matches/${code}/join`, {})).statusCode).toBe(204);
    await kit.host.post(`/api/v1/matches/${code}/bots`, { upTo: 4 });
    const watcher = kit.open(kit.player.cookie);
    await kit.connected(watcher);
    const frames: { s: number; events: { s: number; event: { type: string } }[] }[] = [];
    watcher.on('events', (f: (typeof frames)[number]) => frames.push(f));
    expect((await kit.send(watcher, 'match.watch', { code })).ok).toBe(true);
    const id = (await kit.host.get(`/api/v1/matches/${code}`)).json<{ id: string }>().id;
    await kit.harness.built.match.engine.start(id, 0);
    await kit.harness.built.match.engine.handle({
      matchId: id,
      kind: 'start_match',
      dueAt: Date.now(),
    });
    const hostSocket = kit.open(kit.host.cookie);
    await kit.connected(hostSocket);
    expect(await kit.send(watcher, 'draw.next', { code })).toEqual({
      ok: false,
      code: 'FORBIDDEN',
    });
    expect((await kit.send(hostSocket, 'draw.next', { code })).ok).toBe(true);
    // Room-wide frames carry a round start without anyone's cards or the draw order.
    const start = frames.flatMap((f) => f.events).find((e) => e.event.type === 'roundStarted');
    expect(start?.event).toMatchObject({ cardsByPlayer: {}, drawSequence: [] });
    await expect
      .poll(() => frames.some((f) => f.events.some((e) => e.event.type === 'drawMade')))
      .toBe(true);
    const seqs = frames.flatMap((f) => f.events.map((e) => e.s));
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(await tapOwnNumber(watcher, code, id)).toBe(true);
    await expect
      .poll(() => frames.some((f) => f.events.some((e) => e.event.type === 'cellMarked')))
      .toBe(true);
  });
});

describe('intent order (found by the real-game play-through)', () => {
  it('handles unwatch then watch sent back to back in that order: the socket stays in the room', async () => {
    const code = await kit.createMatch('host');
    const s = kit.open(kit.player.cookie);
    await kit.connected(s);
    const frames: unknown[] = [];
    s.on('events', (f: unknown) => frames.push(f));
    // Not awaited one by one: both are on the wire before the server answers either.
    const unwatch = kit.send(s, 'match.unwatch', { code });
    const watch = kit.send(s, 'match.watch', { code });
    await Promise.all([unwatch, watch]);
    expect((await kit.player.post(`/api/v1/matches/${code}/join`, {})).statusCode).toBe(204);
    await expect.poll(() => frames.length).toBeGreaterThan(0);
  });
});

describe('draw control and limits', () => {
  it('switches draw mode over the socket and tells the room (D8)', async () => {
    const code = await kit.createMatch('host');
    const hostSocket = kit.open(kit.host.cookie);
    await kit.connected(hostSocket);
    const changes: { settings: { drawMode: string } }[] = [];
    hostSocket.on('match', (m: (typeof changes)[number]) => changes.push(m));
    await kit.send(hostSocket, 'match.watch', { code });
    const r = await kit.send(hostSocket, 'draw.setMode', { code, mode: 'auto', intervalMs: 6_000 });
    expect(r).toMatchObject({
      ok: true,
      data: { settings: { drawMode: 'auto', drawIntervalMs: 6_000 } },
    });
    await expect.poll(() => changes.at(-1)?.settings.drawMode).toBe('auto');
  });

  it('drops a repeated seq, limits marks to 4 a second and watches at most 3 matches', async () => {
    const s = kit.open(kit.player.cookie);
    await kit.connected(s);
    const codes = [
      await kit.createMatch('host'),
      await kit.createMatch('host'),
      await kit.createMatch('host'),
      await kit.createMatch('host'),
    ];
    const at = kit.nextSeq();
    expect((await kit.send(s, 'match.watch', { code: codes[0] }, at)).ok).toBe(true);
    expect(await kit.send(s, 'match.watch', { code: codes[0] }, at)).toEqual({
      ok: false,
      code: 'REPLAYED',
    });
    await kit.send(s, 'match.watch', { code: codes[1] });
    await kit.send(s, 'match.watch', { code: codes[2] });
    expect(await kit.send(s, 'match.watch', { code: codes[3] })).toEqual({
      ok: false,
      code: 'TOO_MANY_ROOMS',
    });
    const answers = [];
    for (let i = 0; i < 5; i += 1)
      answers.push(await kit.send(s, 'mark', { code: codes[0], cardIndex: 0, cell: 0 }));
    expect(answers.at(-1)).toEqual({ ok: false, code: 'RATE_LIMITED' });
  });
});

describe('teardown (LOOK-1)', () => {
  it('aborts every match left in the lobby or running', async () => {
    // A match of its own, so the test does not depend on what ran before it.
    const code = await kit.createMatch('host');
    const own = await kit.harness.pool.query<{ id: string }>(
      'SELECT id FROM sbr.matches WHERE code = $1',
      [code],
    );
    const stopped = await stopOpenMatches(kit.harness);
    expect(stopped).toContain(own.rows[0]?.id);
    const open = await kit.harness.pool.query(
      `SELECT 1 FROM sbr.matches WHERE status IN ('lobby', 'running')`,
    );
    expect(open.rowCount).toBe(0);
    for (const id of stopped) {
      const last = (await kit.harness.built.match.store.events(id, 0)).at(-1)?.event;
      expect(last).toEqual({ type: 'matchAborted', reason: 'test cleanup', by: 'system' });
    }
  });
});
