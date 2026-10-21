/**
 * @file   apps/server/test/realtime.integration.test.ts
 * @module server/test
 * @brief  WebSocket gateway: auth, origin, rooms, events, intents, replay protection, limits (WP-11).
 *
 * Responsibility: against a listening server: sockets without a session or from a foreign
 *                 origin are refused; a watcher receives committed events in seq order and
 *                 draw-control changes; the host draws and switches mode over the socket
 *                 (D8), a player may not; a player taps a drawn number; a repeated seq is
 *                 dropped; marks are limited to 4 a second; a socket watches at most 3
 *                 matches; the pause choice between royale rounds is stored and only the
 *                 host may start the next round, only while the match waits (D14); the
 *                 teardown aborts every match the suite left open.
 * Depends on:     vitest, socket.io-client, ./harness, ./session
 * Spec:           docs/spec/06-realtime-architecture.md §1–§5, §8; docs/spec/03-security-architecture.md §8, §13
 */
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  startHarness,
  stopHarness,
  stopOpenMatches,
  SUITE_TIMEOUT_MS,
  type Harness,
} from './harness.js';
import { signIn, type Client } from './session.js';

let harness: Harness;
let url = '';
let host: Client;
let player: Client;
const sockets: Socket[] = [];

beforeAll(async () => {
  harness = await startHarness();
  await harness.built.fastify.listen({ host: '127.0.0.1', port: 0 });
  const address = harness.built.fastify.server.address();
  url = `http://127.0.0.1:${String(typeof address === 'object' && address !== null ? address.port : 0)}/play`;
  host = await signIn(harness.built.fastify, 'host');
  player = await signIn(harness.built.fastify, 'player-1');
}, SUITE_TIMEOUT_MS);
afterAll(async () => {
  for (const s of sockets) s.disconnect();
  await stopHarness(harness);
}, SUITE_TIMEOUT_MS);

function open(cookie: string | null, origin = 'http://localhost:5390'): Socket {
  const headers: Record<string, string> = { origin };
  if (cookie !== null) headers['cookie'] = cookie;
  const s = connect(url, {
    path: '/ws',
    transports: ['websocket'],
    extraHeaders: headers,
    reconnection: false,
  });
  sockets.push(s);
  return s;
}

const connected = (s: Socket) =>
  new Promise<string>((resolve) => {
    s.on('connect', () => {
      resolve('ok');
    });
    s.on('connect_error', (e) => {
      resolve(e.message);
    });
  });

let seq = 0;
const send = (s: Socket, t: string, data: unknown, at = (seq += 1)) =>
  s.emitWithAck('intent', { t, seq: at, data }) as Promise<{
    ok: boolean;
    code?: string;
    data?: unknown;
  }>;

async function createMatch(drawMode: 'auto' | 'host'): Promise<string> {
  const r = await host.post('/api/v1/matches', {
    title: 'ws',
    gameType: 'classic',
    prizes: ['fullCard'],
    drawMode,
    missedNumbers: { kind: 'noAutoMark' },
    maxPlayers: 10,
  });
  return r.json<{ code: string }>().code;
}

describe('handshake (06 §2)', () => {
  it('refuses a socket without a session and one from a foreign origin', async () => {
    expect(await connected(open(null))).toBe('UNAUTHORIZED');
    expect(await connected(open(player.cookie, 'https://evil.example'))).toBe('ORIGIN_NOT_ALLOWED');
    expect(await connected(open(player.cookie))).toBe('ok');
  });
});

// player-1's card cell holding the latest drawn number, or -1.
async function ownCellOfLastDraw(id: string): Promise<number> {
  const round = (await harness.built.match.engine.runner.current(id)).state.currentRound;
  if (round === null) return -1;
  const me = Object.keys(round.cards).find((p) => !p.startsWith('bot-')) ?? '';
  const item = round.draws.at(-1);
  const cells = round.cards[me]?.[0]?.card.cells ?? [];
  return cells.findIndex((c) => c.kind !== 'free' && c.value === item);
}

// The host draws (closing each window by hand) until a number on player-1's card comes,
// then player-1 taps it over the socket. Returns whether the tap was accepted.
async function tapOwnNumber(playerSocket: Socket, code: string, id: string): Promise<boolean> {
  const engine = harness.built.match.engine;
  for (let i = 0; i < 40; i += 1) {
    const cell = await ownCellOfLastDraw(id);
    if (cell >= 0) return (await send(playerSocket, 'mark', { code, cardIndex: 0, cell })).ok;
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
    const code = await createMatch('host');
    expect((await player.post(`/api/v1/matches/${code}/join`, {})).statusCode).toBe(204);
    await host.post(`/api/v1/matches/${code}/bots`, { upTo: 4 });
    const watcher = open(player.cookie);
    await connected(watcher);
    const frames: { s: number; events: { s: number; event: { type: string } }[] }[] = [];
    watcher.on('events', (f: (typeof frames)[number]) => frames.push(f));
    expect((await send(watcher, 'match.watch', { code })).ok).toBe(true);
    const id = (await host.get(`/api/v1/matches/${code}`)).json<{ id: string }>().id;
    await harness.built.match.engine.start(id, 0);
    await harness.built.match.engine.handle({
      matchId: id,
      kind: 'start_match',
      dueAt: Date.now(),
    });
    const hostSocket = open(host.cookie);
    await connected(hostSocket);
    expect(await send(watcher, 'draw.next', { code })).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect((await send(hostSocket, 'draw.next', { code })).ok).toBe(true);
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

describe('who hosts a match (POLISH-1)', () => {
  it('tells the host, and only the host, that they host the match; a player cannot draw', async () => {
    const code = await createMatch('host');
    const asHost = (await host.get(`/api/v1/matches/${code}`)).json<{ youHost: boolean }>();
    const asPlayer = (await player.get(`/api/v1/matches/${code}`)).json<{ youHost: boolean }>();
    expect(asHost.youHost).toBe(true);
    expect(asPlayer.youHost).toBe(false);
    const listed = (await host.get('/api/v1/matches')).json<{
      matches: { code: string; youHost: boolean }[];
    }>();
    expect(listed.matches.find((m) => m.code === code)?.youHost).toBe(true);
    const s = open(player.cookie);
    await connected(s);
    expect(await send(s, 'draw.next', { code })).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect((await player.post(`/api/v1/matches/${code}/start`, {})).statusCode).toBe(403);
  });
});

describe('pause between royale rounds (D14)', () => {
  it('stores the host choice; only the host may start the next round, and only when it waits', async () => {
    const r = await host.post('/api/v1/matches', {
      title: 'pause',
      gameType: 'royale',
      drawMode: 'host',
      missedNumbers: { kind: 'noAutoMark' },
      maxPlayers: 10,
      roundPause: { kind: 'host' },
    });
    const { code } = r.json<{ code: string }>();
    const id = (await host.get(`/api/v1/matches/${code}`)).json<{ id: string }>().id;
    // Read back from PostgreSQL (store.load), not from the engine's cache.
    const loaded = await harness.built.match.store.load(id);
    expect(loaded?.record.settings.roundPause).toEqual({ kind: 'host' });
    const summary = (await host.get(`/api/v1/matches/${code}`)).json<{ waitingForHost: boolean }>();
    expect(summary.waitingForHost).toBe(false);
    const playerSocket = open(player.cookie);
    await connected(playerSocket);
    expect(await send(playerSocket, 'round.next', { code })).toEqual({
      ok: false,
      code: 'FORBIDDEN',
    });
    const hostSocket = open(host.cookie);
    await connected(hostSocket);
    expect(await send(hostSocket, 'round.next', { code })).toEqual({
      ok: false,
      code: 'NOT_WAITING_FOR_HOST',
    });
  });
});

describe('fast test profile (development only)', () => {
  it('gives royale the short test ruleset and keeps the classic default', async () => {
    const created = async (gameType: string) => {
      const r = await host.post('/api/v1/matches', {
        title: 'fast',
        gameType,
        ...(gameType === 'royale' ? {} : { prizes: ['fullCard'] }),
        drawMode: 'host',
        missedNumbers: { kind: 'noAutoMark' },
        maxPlayers: 8,
        testProfile: 'fast',
      });
      const { id } = r.json<{ id: string }>();
      return (await harness.built.match.store.load(id))?.record;
    };
    const royale = await created('royale');
    expect(royale?.rulesetName).toBe('royale-realtime-fast-test');
    expect(royale?.ruleset.stages?.map((s) => s.rounds)).toEqual([1, 1, 1]);
    expect((await created('classic'))?.rulesetName).toBe('classic-realtime');
  });
});

describe('intent order (found by the real-game play-through)', () => {
  it('handles unwatch then watch sent back to back in that order: the socket stays in the room', async () => {
    const code = await createMatch('host');
    const s = open(player.cookie);
    await connected(s);
    const frames: unknown[] = [];
    s.on('events', (f: unknown) => frames.push(f));
    // Not awaited one by one: both are on the wire before the server answers either.
    const unwatch = send(s, 'match.unwatch', { code });
    const watch = send(s, 'match.watch', { code });
    await Promise.all([unwatch, watch]);
    expect((await player.post(`/api/v1/matches/${code}/join`, {})).statusCode).toBe(204);
    await expect.poll(() => frames.length).toBeGreaterThan(0);
  });
});

describe('draw control and limits', () => {
  it('switches draw mode over the socket and tells the room (D8)', async () => {
    const code = await createMatch('host');
    const hostSocket = open(host.cookie);
    await connected(hostSocket);
    const changes: { settings: { drawMode: string } }[] = [];
    hostSocket.on('match', (m: (typeof changes)[number]) => changes.push(m));
    await send(hostSocket, 'match.watch', { code });
    const r = await send(hostSocket, 'draw.setMode', { code, mode: 'auto', intervalMs: 6_000 });
    expect(r).toMatchObject({
      ok: true,
      data: { settings: { drawMode: 'auto', drawIntervalMs: 6_000 } },
    });
    await expect.poll(() => changes.at(-1)?.settings.drawMode).toBe('auto');
  });

  it('drops a repeated seq, limits marks to 4 a second and watches at most 3 matches', async () => {
    const s = open(player.cookie);
    await connected(s);
    const codes = [
      await createMatch('host'),
      await createMatch('host'),
      await createMatch('host'),
      await createMatch('host'),
    ];
    const at = (seq += 1);
    expect((await send(s, 'match.watch', { code: codes[0] }, at)).ok).toBe(true);
    expect(await send(s, 'match.watch', { code: codes[0] }, at)).toEqual({
      ok: false,
      code: 'REPLAYED',
    });
    await send(s, 'match.watch', { code: codes[1] });
    await send(s, 'match.watch', { code: codes[2] });
    expect(await send(s, 'match.watch', { code: codes[3] })).toEqual({
      ok: false,
      code: 'TOO_MANY_ROOMS',
    });
    const answers = [];
    for (let i = 0; i < 5; i += 1)
      answers.push(await send(s, 'mark', { code: codes[0], cardIndex: 0, cell: 0 }));
    expect(answers.at(-1)).toEqual({ ok: false, code: 'RATE_LIMITED' });
  });
});

describe('teardown (LOOK-1)', () => {
  it('aborts every match the suite left in the lobby or running', async () => {
    const stopped = await stopOpenMatches(harness);
    expect(stopped.length).toBeGreaterThan(0);
    const open = await harness.pool.query(
      `SELECT 1 FROM sbr.matches WHERE status IN ('lobby', 'running')`,
    );
    expect(open.rowCount).toBe(0);
    for (const id of stopped) {
      const last = (await harness.built.match.store.events(id, 0)).at(-1)?.event;
      expect(last).toEqual({ type: 'matchAborted', reason: 'test cleanup' });
    }
  });
});
