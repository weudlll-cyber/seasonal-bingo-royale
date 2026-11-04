/**
 * @file   load/drawRun.mjs
 * @module load
 * @brief  One realtime royale under load: players and spectators watching, players tapping, the latencies.
 *
 * Responsibility: given a host and signed-in players and spectators (cookie, CSRF token, name),
 *                 the host creates a royale with timed draws every 4 s, the players join, every
 *                 socket watches it as the player screen does (appends taps, fetches new events
 *                 one fetch at a time; round-start fetch size recorded), every `tapEvery`-th
 *                 player taps its drawn numbers as they arrive, inside the speed window. Records
 *                 per draw and socket the time from the draw event's `at` to arrival and to
 *                 fetch end, per tap the time to its acknowledgement, the gaps between draws;
 *                 samples the server's CPU, memory and event-loop lag from /metrics. Ends with
 *                 the match or after `minutes`, then the host aborts the match (append-only
 *                 log). Who signs the accounts in and removes them is the caller's.
 * Depends on:     socket.io-client, ./common.mjs
 * Used by:        ./drawLatency.mjs (local development stack), ./loadcheck.mjs (sbr loadcheck)
 * Spec:           docs/spec/12-testing-strategy.md §5; docs/spec/06-realtime-architecture.md §8
 */
import { io } from 'socket.io-client';

import { call, errors, fail, inBatches, ORIGIN, SOCKET, summary, watchServer } from './common.mjs';

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

// A screen's fetches: at most one running and one waiting, as the screen does; the waiting
// one covers every draw that arrived in the meantime. Returns `fetchNew(draws)`.
function screenFetches(player, code, record, view) {
  let running = null;
  let waiting = [];
  return (draws) => {
    waiting.push(...draws);
    if (running !== null) return;
    running = (async () => {
      do {
        const covered = waiting;
        waiting = [];
        const fetched = await call(
          player,
          'GET',
          `/matches/${code}/state?since=${String(view.since)}`,
        );
        if (fetched !== null) {
          view.since = Math.max(view.since, fetched.seq);
          // The player's own cards come with its view of a round start (frames carry none).
          const start = fetched.view.events.findLast((e) => e.type === 'roundStarted');
          if (start !== undefined) {
            view.card = start.cardsByPlayer[player.name]?.[0] ?? null;
            record.roundStartBytes.push(JSON.stringify(fetched).length);
          }
        }
        const now = Date.now();
        for (const d of covered) record.fetch.push(now - d.at);
      } while (waiting.length > 0);
      running = null;
    })();
  };
}

// A tapper's taps of the drawn numbers on its card, each timed to its acknowledgement.
async function tap(intent, code, view, draws, record) {
  for (const d of draws) {
    const cell = view.card.cells.findIndex((c) => c.kind !== 'free' && c.value === d.event.item);
    if (cell < 0) continue;
    const sent = Date.now();
    // A socket closed at the end of the run rejects its pending acknowledgements.
    const a = await intent('mark', { code, cardIndex: 0, cell }).catch((e) => ({
      ok: false,
      code: e.message,
    }));
    if (a.ok) record.tapAck.push(Date.now() - sent);
    else fail('intent', `mark ${String(a.code)}`);
  }
}

// A player's (or spectator's) socket: watches the match, fetches as the screen does, taps when
// it is a tapper; records the latencies (a spectator's draw arrivals in `spectatorFrame`).
function connectPlayer(player, code, record) {
  const socket = io(SOCKET.url, {
    path: SOCKET.path,
    transports: ['websocket'],
    extraHeaders: { cookie: player.cookie, origin: ORIGIN },
    reconnection: false,
  });
  let seq = 0;
  const view = { since: 0, card: null };
  const fetchNew = screenFetches(player, code, record, view);
  const intent = (t, data) => socket.emitWithAck('intent', { t, seq: (seq += 1), data });
  socket.on('connect_error', (e) => fail('socket', `${player.name}: ${e.message}`));
  socket.on('events', async (frame) => {
    const arrived = Date.now();
    const draws = frame.events.filter((e) => e.event.type === 'drawMade');
    for (const d of draws) {
      (player.spectator ? record.spectatorFrame : record.frame).push(arrived - d.at);
      record.drawAt.set(d.s, d.at);
    }
    if (frame.events[0]?.s === view.since + 1 && appendable(frame, player.name)) {
      view.since = frame.s;
    } else fetchNew(draws);
    if (player.tapper && view.card !== null) await tap(intent, code, view, draws, record);
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

// Gaps between consecutive draws of a round (a round's start and the pause excluded).
function drawGaps(drawAt) {
  const times = [...drawAt.entries()].sort((a, b) => a[0] - b[0]).map(([, at]) => at);
  return times.slice(1).flatMap((t, i) => (t - times[i] < 30_000 ? [t - times[i]] : []));
}

function report(record, server, extra) {
  const cpu = server.samples.map((s) => s.cpuPct);
  return {
    ...extra,
    rounds: record.rounds,
    finished: record.finished,
    frameLatencyMs: summary(record.frame),
    spectatorFrameLatencyMs: summary(record.spectatorFrame),
    screenReadyMs: summary(record.fetch),
    tapAckMs: summary(record.tapAck),
    drawGapMs: summary(drawGaps(record.drawAt)),
    // The size of a screen's fetch that brought a round start (its own cards).
    roundStartFetchBytes: summary(record.roundStartBytes),
    serverCpuPercent: {
      avg: cpu.reduce((a, b) => a + b, 0) / Math.max(1, cpu.length),
      max: Math.max(...cpu),
    },
    serverRssMbMax: Math.max(...server.samples.map((s) => s.rss)) / 1_048_576,
    eventLoopLagP99MsMax: Math.max(...server.samples.map((s) => s.lag)) * 1000,
    errors,
  };
}

export async function runDrawCheck({ host, players, spectators, tapEvery, minutes, create }) {
  const started = Date.now();
  const created = await call(host, 'POST', '/matches', {
    gameType: 'royale',
    drawMode: 'auto',
    drawIntervalMs: 4_000,
    missedNumbers: { kind: 'noAutoMark' },
    maxPlayers: 200,
    ...create,
  });
  if (created?.code === undefined)
    throw new Error(`the host could not create the match (${JSON.stringify(errors.examples)})`);
  const code = created.code;
  players.forEach((p, i) => (p.tapper = i % tapEvery === 0));
  spectators.forEach((v) => (v.spectator = true));
  await inBatches(players, 20, (p) => call(p, 'POST', `/matches/${code}/join`, {}));
  const record = {
    frame: [],
    spectatorFrame: [],
    fetch: [],
    tapAck: [],
    // Each draw's time by its seq: the gaps show whether draws keep their 4 s interval.
    drawAt: new Map(),
    roundStartBytes: [],
    rounds: 0,
    finished: false,
  };
  const sockets = await inBatches([...players, ...spectators], 25, (p) =>
    connectPlayer(p, code, record),
  );
  const server = watchServer();
  try {
    await call(host, 'POST', `/matches/${code}/start`, {});
    const until = Date.now() + minutes * 60_000;
    while (!record.finished && Date.now() < until) await new Promise((r) => setTimeout(r, 1_000));
  } finally {
    await server.stop();
    for (const s of sockets) s.disconnect();
    if (!record.finished)
      await call(host, 'POST', `/matches/${code}/abort`, { reason: 'load check done' });
  }
  return report(record, server, {
    players: players.length,
    spectators: spectators.length,
    code,
    minutes: (Date.now() - started) / 60_000,
  });
}
