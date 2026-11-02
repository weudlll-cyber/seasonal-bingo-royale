/**
 * @file   load/drawLatency.mjs
 * @module load
 * @brief  200-player check: draw latency at every socket, server CPU and memory.
 *
 * Responsibility: against a running development stack (server 3900): sign in N load players (dev
 *                 sign-in `load-NNN`), join one royale with timed draws (fast profile, 4 s),
 *                 connect N watching sockets that, like the player screen, append taps and fetch
 *                 new events one fetch at a time (round-start fetch size recorded); every fifth
 *                 player taps. Records per draw and socket the time from the draw event's `at` to
 *                 arrival and to fetch end; samples CPU, memory and event-loop lag from /metrics.
 *                 Then aborts the match (append-only log) and deletes the load accounts.
 *                 Usage: node load/drawLatency.mjs [players=200]
 * Depends on:     socket.io-client, ./common.mjs
 * Spec:           docs/spec/02-software-architecture.md; docs/spec/06-realtime-architecture.md §8;
 *                 docs/spec/08-devops-architecture.md §6 (draw latency p95 under 1 s)
 */
import { io } from 'socket.io-client';

import {
  BASE,
  call,
  errors,
  fail,
  inBatches,
  ORIGIN,
  signIn,
  summary,
  watchServer,
} from './common.mjs';

const PLAYERS = Number(process.argv[2] ?? 200);
const TAPPER_EVERY = 5;

// As the player screen does (apps/web/src/game/useLiveMatch.ts): other players' taps,
// patterns, prizes and window closes are appended; anything else fetches.
const APPENDABLE = new Set([
  'cellMarked',
  'patternScored',
  'classicPrizeAwarded',
  'speedWindowClosed',
]);
const appendable = (frame, me) =>
  frame.events.every((e) => APPENDABLE.has(e.event.type) && e.event.accountId !== me);

// A player's socket: watches the match, fetches the new events after every frame as the
// screen does, taps drawn numbers when it is a tapper; records the latencies.
function connectPlayer(player, code, record) {
  const socket = io(`${BASE}/play`, {
    path: '/ws',
    transports: ['websocket'],
    extraHeaders: { cookie: player.cookie, origin: ORIGIN },
    reconnection: false,
  });
  let seq = 0;
  let since = 0;
  let card = null;
  // At most one fetch running and one waiting, as the screen does; the waiting one covers
  // every draw that arrived in the meantime.
  let running = null;
  let waiting = [];
  const fetchNew = (draws) => {
    waiting.push(...draws);
    if (running !== null) return;
    running = (async () => {
      do {
        const covered = waiting;
        waiting = [];
        const fetched = await call(player, 'GET', `/matches/${code}/state?since=${String(since)}`);
        if (fetched !== null) {
          since = Math.max(since, fetched.seq);
          // The player's own cards come with its view of a round start (frames carry none).
          const start = fetched.view.events.findLast((e) => e.type === 'roundStarted');
          if (start !== undefined) {
            card = start.cardsByPlayer[player.name]?.[0] ?? null;
            record.roundStartBytes.push(JSON.stringify(fetched).length);
          }
        }
        const now = Date.now();
        for (const d of covered) record.fetch.push(now - d.at);
      } while (waiting.length > 0);
      running = null;
    })();
  };
  const intent = (t, data) => socket.emitWithAck('intent', { t, seq: (seq += 1), data });
  socket.on('connect_error', (e) => fail('socket', `${player.as}: ${e.message}`));
  socket.on('events', async (frame) => {
    const arrived = Date.now();
    const draws = frame.events.filter((e) => e.event.type === 'drawMade');
    for (const d of draws) record.frame.push(arrived - d.at);
    if (frame.events[0]?.s === since + 1 && appendable(frame, player.name)) since = frame.s;
    else fetchNew(draws);
    if (player.tapper && card !== null) {
      for (const d of draws) {
        const cell = card.cells.findIndex((c) => c.kind !== 'free' && c.value === d.event.item);
        if (cell < 0) continue;
        const a = await intent('mark', { code, cardIndex: 0, cell });
        if (!a.ok) fail('intent', `mark ${String(a.code)}`);
      }
    }
    if (frame.events.some((e) => e.event.type === 'roundEnded')) record.rounds += 1;
    if (frame.events.some((e) => e.event.type === 'matchFinished')) record.finished = true;
  });
  return new Promise((resolve) => {
    socket.on('connect', async () => {
      const a = await intent('match.watch', { code });
      if (!a.ok) fail('intent', `watch ${String(a.code)}`);
      resolve(socket);
    });
    socket.on('connect_error', () => resolve(socket));
  });
}

async function main() {
  const started = Date.now();
  const host = await signIn('host');
  const created = await call(host, 'POST', '/matches', {
    title: `Load check ${String(PLAYERS)}`,
    gameType: 'royale',
    drawMode: 'auto',
    drawIntervalMs: 4_000,
    missedNumbers: { kind: 'noAutoMark' },
    maxPlayers: 200,
    testProfile: 'fast',
  });
  const code = created.code;
  const ids = Array.from({ length: PLAYERS }, (_v, i) => `load-${String(i + 1).padStart(3, '0')}`);
  const players = await inBatches(ids, 20, signIn);
  players.forEach((p, i) => (p.tapper = i % TAPPER_EVERY === 0));
  await inBatches(players, 20, (p) => call(p, 'POST', `/matches/${code}/join`, {}));
  const record = { frame: [], fetch: [], roundStartBytes: [], rounds: 0, finished: false };
  const sockets = await inBatches(players, 25, (p) => connectPlayer(p, code, record));
  const server = watchServer();
  await call(host, 'POST', `/matches/${code}/start`, {});
  const until = Date.now() + 12 * 60_000;
  while (!record.finished && Date.now() < until) await new Promise((r) => setTimeout(r, 1_000));
  await server.stop();
  for (const s of sockets) s.disconnect();
  await call(host, 'POST', `/matches/${code}/abort`, { reason: 'load check done' });
  const removed = await (
    await fetch(`${BASE}/api/v1/dev/load-accounts`, { method: 'DELETE' })
  ).json();
  const cpu = server.samples.map((s) => s.cpuPct);
  console.log(
    JSON.stringify(
      {
        players: PLAYERS,
        code,
        rounds: record.rounds,
        finished: record.finished,
        frameLatencyMs: summary(record.frame),
        screenReadyMs: summary(record.fetch),
        // The size of a screen's fetch that brought a round start (its own cards).
        roundStartFetchBytes: summary(record.roundStartBytes),
        serverCpuPercent: {
          avg: cpu.reduce((a, b) => a + b, 0) / Math.max(1, cpu.length),
          max: Math.max(...cpu),
        },
        serverRssMbMax: Math.max(...server.samples.map((s) => s.rss)) / 1_048_576,
        eventLoopLagP99MsMax: Math.max(...server.samples.map((s) => s.lag)) * 1000,
        errors,
        accountsRemoved: removed.deleted,
        minutes: (Date.now() - started) / 60_000,
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
