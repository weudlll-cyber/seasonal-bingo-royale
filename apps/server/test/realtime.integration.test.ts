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
 *                 watches at most 3 matches; a player whose account was deleted is named
 *                 "deleted player …" in frames, never by the account id, also by a server
 *                 that never saw the name; a host intent is refused once the session has
 *                 expired (the socket closes) or the host role is gone, though both were
 *                 fine at connect; the teardown aborts every match left open.
 *                 The match rules over the socket are in ./matchRules.integration.test.ts.
 * Depends on:     node:crypto, vitest, socket.io-client, ../src/auth/accounts, ../src/index (types),
 *                 ./harness, ./playToEnd, ./session, ./socketKit
 * Spec:           docs/spec/06-realtime-architecture.md §1–§5, §8; docs/spec/03-security-architecture.md §3, §8, §13
 */
import { createHash } from 'node:crypto';

import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { deleteAccount } from '../src/auth/accounts.js';
import type { App } from '../src/index.js';
import { buildOn, stopOpenMatches, SUITE_TIMEOUT_MS } from './harness.js';
import { playToEnd } from './playToEnd.js';
import { signIn, type Client } from './session.js';
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

interface Placement {
  readonly accountId: string;
}
type Frame = { events: { event: { type: string; placement?: Placement[] } }[] };

// A second server on the suite's database, listening; its gateway has met no player yet.
async function secondServer(): Promise<{ app: App; url: string }> {
  const app = await buildOn(kit.harness.pool, kit.harness.container.getConnectionUri());
  await app.fastify.listen({ host: '127.0.0.1', port: 0 });
  const address = app.fastify.server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return { app, url: `http://127.0.0.1:${String(port)}/play` };
}

describe('display names in frames come from the match entries (audit S10)', () => {
  it('names a player whose account was deleted "deleted player", never by the account id', async () => {
    const code = await kit.createMatch('host');
    const leaver = await signIn(kit.harness.built.fastify, 'player-2');
    expect((await leaver.post(`/api/v1/matches/${code}/join`, {})).statusCode).toBe(204);
    await kit.host.post(`/api/v1/matches/${code}/bots`, { upTo: 4 });
    const me = await leaver.get('/api/v1/session');
    const accountId = me.json<{ account: { id: string } }>().account.id;
    const id = (await kit.host.get(`/api/v1/matches/${code}`)).json<{ id: string }>().id;
    // The test's account goes again (dev sign-in creates it anew when asked).
    await deleteAccount(kit.harness.pool, accountId);
    const second = await secondServer();
    const s = connect(second.url, {
      path: '/ws',
      transports: ['websocket'],
      extraHeaders: { origin: 'http://localhost:5390', cookie: kit.host.cookie },
      reconnection: false,
    });
    try {
      await kit.connected(s);
      const frames: Frame[] = [];
      s.on('events', (f: Frame) => frames.push(f));
      expect((await kit.send(s, 'match.watch', { code })).ok).toBe(true);
      const engine = second.app.match.engine;
      await engine.start(id, 0);
      await engine.handle({ matchId: id, kind: 'start_match', dueAt: Date.now() });
      await playToEnd(engine, id);
      const finished = () =>
        frames.flatMap((f) => f.events).find((e) => e.event.type === 'matchFinished');
      await expect.poll(finished).toBeDefined();
      const names = (finished()?.event.placement ?? []).map((p) => p.accountId);
      expect(names).not.toContain(accountId);
      expect(names.filter((n) => n.startsWith('deleted player '))).toHaveLength(1);
    } finally {
      s.disconnect();
      await second.app.fastify.close();
    }
  }, 120_000);
});

// The session row behind a test client's cookie (the database keeps only the SHA-256).
function sessionHash(client: Client): Buffer {
  const token = decodeURIComponent(client.cookie.split('=').slice(1).join('='));
  return createHash('sha256').update(token).digest();
}

describe('host intents re-check the session (03 §3, 06 §2.3)', () => {
  it('refuses a host intent once the session has expired, and closes the socket', async () => {
    const code = await kit.createMatch('host');
    const host = await signIn(kit.harness.built.fastify, 'host');
    const s = kit.open(host.cookie);
    await kit.connected(s);
    const closed = new Promise<void>((resolve) => {
      s.on('disconnect', () => {
        resolve();
      });
    });
    expect((await kit.send(s, 'draw.setMode', { code, mode: 'host' })).ok).toBe(true);
    await kit.harness.pool.query(
      `UPDATE sbr.sessions SET expires_at = now() - interval '1 second' WHERE token_hash = $1`,
      [sessionHash(host)],
    );
    expect(await kit.send(s, 'draw.setMode', { code, mode: 'host' })).toEqual({
      ok: false,
      code: 'UNAUTHORIZED',
    });
    await closed;
  });

  it('refuses a host intent once the host role is gone', async () => {
    const code = await kit.createMatch('host');
    const s = kit.open(kit.host.cookie);
    await kit.connected(s);
    expect((await kit.send(s, 'draw.setMode', { code, mode: 'host' })).ok).toBe(true);
    const removed = await kit.harness.pool.query<{ account_id: string }>(
      `DELETE FROM sbr.role_assignments ra USING sbr.accounts a
        WHERE a.id = ra.account_id AND a.display_name = 'dev-host' AND ra.role_id = 'organizer'
        RETURNING ra.account_id`,
    );
    try {
      expect(await kit.send(s, 'draw.setMode', { code, mode: 'host' })).toEqual({
        ok: false,
        code: 'FORBIDDEN',
      });
    } finally {
      // The role comes back for the rest of the file.
      for (const row of removed.rows) {
        await kit.harness.pool.query(
          `INSERT INTO sbr.role_assignments (account_id, role_id) VALUES ($1, 'organizer')`,
          [row.account_id],
        );
      }
    }
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
