/**
 * @file   load/drawLatency.mjs
 * @module load
 * @brief  200-player check: draw latency at every socket, server CPU and memory.
 *
 * Responsibility: against a running development stack (server 3900): sign in N numbered
 *                 load players (dev sign-in `load-NNN`), let them join one royale match with
 *                 timed draws (fast test profile, 4 s), connect N sockets that watch the match
 *                 and, like the player screen, append other players' taps and fetch the new
 *                 events for everything else (one fetch at a time; a round start brings the
 *                 player's own cards and the size of that fetch is recorded); every
 *                 fifth player taps its drawn numbers. For every draw and socket it records
 *                 the time from the server's draw event (`at` in the frame) to its arrival,
 *                 and to the end of that screen's fetch; it samples the server's CPU, memory
 *                 and event-loop lag from /metrics. Then it aborts the match (it stays in the
 *                 database: the event log is append-only) and deletes the load accounts.
 *                 Usage: node load/drawLatency.mjs [players=200]
 * Depends on:     socket.io-client
 * Spec:           docs/spec/02-software-architecture.md; docs/spec/06-realtime-architecture.md §8;
 *                 docs/spec/08-devops-architecture.md §6 (draw latency p95 under 1 s)
 */
import { io } from 'socket.io-client';

const BASE = 'http://127.0.0.1:3900';
const ORIGIN = 'http://localhost:5390';
const PLAYERS = Number(process.argv[2] ?? 200);
const TAPPER_EVERY = 5;

const errors = { http: 0, socket: 0, intent: 0, examples: [] };
function fail(kind, detail) {
  errors[kind] += 1;
  if (errors.examples.length < 10) errors.examples.push(`${kind}: ${detail}`);
}

// One signed-in client: its session cookie, CSRF token and account id.
async function signIn(as) {
  const r = await fetch(`${BASE}/api/v1/dev/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ as }),
  });
  const cookie = (r.headers.get('set-cookie') ?? '').split(';')[0];
  const { displayName } = await r.json();
  const session = await (await fetch(`${BASE}/api/v1/session`, { headers: { cookie } })).json();
  return { as, cookie, csrf: session.csrfToken, name: displayName };
}

async function call(client, method, path, body) {
  const r = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: {
      cookie: client.cookie,
      origin: ORIGIN,
      'x-csrf-token': client.csrf,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!r.ok) fail('http', `${method} ${path} → ${String(r.status)}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}

async function inBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

const percentile = (values, p) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};

function summary(values) {
  return {
    n: values.length,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    p99: percentile(values, 99),
    max: values.length === 0 ? null : Math.max(...values),
  };
}

// The server's process metrics (prom-client, prefix sbr_).
async function metrics() {
  const text = await (await fetch(`${BASE}/metrics`)).text();
  const value = (name) => Number(new RegExp(`^${name} ([\\d.e+-]+)`, 'm').exec(text)?.[1] ?? NaN);
  return {
    cpu: value('sbr_process_cpu_seconds_total'),
    rss: value('sbr_process_resident_memory_bytes'),
    lag: value('sbr_nodejs_eventloop_lag_p99_seconds'),
  };
}

// Samples the server every 2 s, one request at a time (a slow answer skips a beat).
function watchServer() {
  const samples = [];
  let last = null;
  let running = true;
  const loop = async () => {
    while (running) {
      const m = await metrics().catch(() => null);
      const at = Date.now();
      if (m !== null && Number.isFinite(m.cpu)) {
        if (last !== null) {
          samples.push({
            cpuPct: ((m.cpu - last.m.cpu) * 100_000) / (at - last.at),
            rss: m.rss,
            lag: m.lag,
          });
        }
        last = { m, at };
      }
      await new Promise((r) => setTimeout(r, 2_000));
    }
  };
  const done = loop();
  return {
    stop: async () => {
      running = false;
      await done;
    },
    samples,
  };
}

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
