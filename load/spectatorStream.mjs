/**
 * @file   load/spectatorStream.mjs
 * @module load
 * @brief  What one spectator socket receives per draw in a 200-player royale (D24).
 *
 * Responsibility: against a running development stack (server 3900): sign in N load players,
 *                 join one royale with timed draws every 2 s (fast profile, missed numbers marked
 *                 after the speed window, so every player marks), and connect one spectator (a
 *                 load account that does not play) that behaves as the player screen does
 *                 (apps/web/src/game/useLiveMatch.ts): frames of other players' taps are appended
 *                 unless they name a watched player, anything else fetches `state?since=` with
 *                 `known=` (the watched cards it holds). Records per draw the bytes of frames and
 *                 fetches, the part of them that is the watch block, and the server's CPU. Then
 *                 aborts the match (append-only log) and deletes the load accounts.
 *                 Usage: node load/spectatorStream.mjs [players=200] [minutes=4]
 * Depends on:     socket.io-client, ./common.mjs
 * Spec:           docs/spec/06-realtime-architecture.md §8; docs/spec/01-game-design.md §13 (D24)
 */
import { io } from 'socket.io-client';

import { BASE, call, errors, fail, inBatches, ORIGIN, signIn, watchServer } from './common.mjs';

const PLAYERS = Number(process.argv[2] ?? 200);
const MINUTES = Number(process.argv[3] ?? 4);
const APPENDABLE = new Set([
  'cellMarked',
  'patternScored',
  'classicPrizeAwarded',
  'speedWindowClosed',
]);

// The spectator: counts every byte it receives and how much of it is the watch block.
function connectSpectator(viewer, code, record) {
  const socket = io(`${BASE}/play`, {
    path: '/ws',
    transports: ['websocket'],
    extraHeaders: { cookie: viewer.cookie, origin: ORIGIN },
    reconnection: false,
  });
  let since = 0;
  let watched = new Set();
  let known = { round: -1, names: [] };
  let running = false;
  let again = false;
  const fetchNew = async () => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    do {
      again = false;
      const q = known.round < 0 ? '' : `&known=${String(known.round)}:${known.names.join(',')}`;
      const fetched = await call(
        viewer,
        'GET',
        `/matches/${code}/state?since=${String(since)}${q}`,
      );
      if (fetched === null) continue;
      record.fetchBytes += JSON.stringify(fetched).length;
      const watch = fetched.view.watch;
      if (watch !== undefined) {
        record.watchBytes += JSON.stringify(watch).length;
        record.cardBytes += JSON.stringify(watch.cards).length;
        watched = new Set(Object.keys(watch.oneToGo));
        const start = fetched.view.events.findLast((e) => e.type === 'roundStarted');
        if (start !== undefined) known = { round: start.roundIndex, names: [] };
        known.names = [...new Set([...known.names, ...Object.keys(watch.cards)])];
      }
      since = Math.max(since, fetched.seq);
    } while (again);
    running = false;
  };
  socket.on('connect_error', (e) => fail('socket', e.message));
  socket.on('events', (frame) => {
    record.frameBytes += JSON.stringify(frame).length;
    record.draws += frame.events.filter((e) => e.event.type === 'drawMade').length;
    const plain = frame.events.every(
      (e) => APPENDABLE.has(e.event.type) && !watched.has(e.event.accountId),
    );
    if (frame.events[0]?.s === since + 1 && plain) since = frame.s;
    else void fetchNew();
  });
  return new Promise((resolve) => {
    socket.on('connect', async () => {
      await socket.emitWithAck('intent', { t: 'match.watch', seq: 1, data: { code } });
      await fetchNew();
      resolve(socket);
    });
  });
}

async function main() {
  const host = await signIn('host');
  const created = await call(host, 'POST', '/matches', {
    title: `Spectator stream ${String(PLAYERS)}`,
    gameType: 'royale',
    drawMode: 'auto',
    drawIntervalMs: 2_000,
    missedNumbers: { kind: 'autoMarkAfter', delayMs: 1_500 },
    maxPlayers: 200,
    testProfile: 'fast',
  });
  const code = created.code;
  const ids = Array.from({ length: PLAYERS }, (_v, i) => `load-${String(i + 1).padStart(3, '0')}`);
  const players = await inBatches(ids, 20, signIn);
  await inBatches(players, 20, (p) => call(p, 'POST', `/matches/${code}/join`, {}));
  const record = { frameBytes: 0, fetchBytes: 0, watchBytes: 0, cardBytes: 0, draws: 0 };
  const spectator = await signIn('load-900');
  const socket = await connectSpectator(spectator, code, record);
  const start = { ...record };
  const server = watchServer();
  await call(host, 'POST', `/matches/${code}/start`, {});
  await new Promise((r) => setTimeout(r, MINUTES * 60_000));
  await server.stop();
  socket.disconnect();
  await call(host, 'POST', `/matches/${code}/abort`, { reason: 'load check done' });
  const removed = await (
    await fetch(`${BASE}/api/v1/dev/load-accounts`, { method: 'DELETE' })
  ).json();
  const perDraw = (key) => Math.round((record[key] - start[key]) / Math.max(1, record.draws));
  const cpu = server.samples.map((s) => s.cpuPct);
  console.log(
    JSON.stringify(
      {
        players: PLAYERS,
        code,
        draws: record.draws,
        bytesPerDraw: {
          frames: perDraw('frameBytes'),
          fetches: perDraw('fetchBytes'),
          watchBlock: perDraw('watchBytes'),
          watchedCards: perDraw('cardBytes'),
        },
        serverCpuPercent: {
          avg: cpu.reduce((a, b) => a + b, 0) / Math.max(1, cpu.length),
          max: Math.max(...cpu),
        },
        errors,
        accountsRemoved: removed.deleted,
      },
      null,
      2,
    ),
  );
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
