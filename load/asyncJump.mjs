/**
 * @file   load/asyncJump.mjs
 * @module load
 * @brief  200-player asynchronous royale: "Jump ahead 1 day" and every player's away summary.
 *
 * Responsibility: against a running stack with development features (server 3900): sign in N
 *                 load players (dev sign-in `load-NNN`), join one asynchronous royale (15-minute
 *                 draws, no quiet hours), start it, let every player look once (the away summary
 *                 records where each stands), move the match one day ahead (dev time travel, as
 *                 the console's "Jump ahead 1 day"), then fetch every player's away summary at
 *                 once. Records the jump's duration, the summaries' latencies (p50/p95/p99) and
 *                 how many came back non-empty; samples CPU, memory and event-loop lag from
 *                 /metrics. Then aborts the match (append-only log) and deletes the load accounts.
 *                 Usage: node load/asyncJump.mjs [players=200]
 * Depends on:     ./devDefaults.mjs, ./common.mjs
 * Spec:           docs/spec/01-game-design.md §11; docs/spec/06-realtime-architecture.md §6;
 *                 docs/spec/12-testing-strategy.md §5
 */
import './devDefaults.mjs';
import { BASE, call, errors, inBatches, signIn, summary, watchServer } from './common.mjs';

const PLAYERS = Number(process.argv[2] ?? 200);
const DAY = 86_400_000;

// Every player's away summary at once; the latencies and how many brought news.
async function summaries(players, code) {
  const times = [];
  const results = await Promise.all(
    players.map(async (p) => {
      const sent = Date.now();
      const r = await call(p, 'GET', `/matches/${code}/away-summary`);
      times.push(Date.now() - sent);
      return r?.summary ?? null;
    }),
  );
  return { latencyMs: summary(times), withNews: results.filter((s) => s !== null).length };
}

async function main() {
  const started = Date.now();
  const host = await signIn('host');
  const created = await call(host, 'POST', '/matches', {
    title: `Async load check ${String(PLAYERS)}`,
    gameType: 'royale',
    mode: 'async',
    quietHours: null,
    drawMode: 'auto',
    missedNumbers: { kind: 'noAutoMark' },
    maxPlayers: 200,
  });
  const code = created.code;
  const ids = Array.from({ length: PLAYERS }, (_v, i) => `load-${String(i + 1).padStart(3, '0')}`);
  const players = await inBatches(ids, 20, signIn);
  await inBatches(players, 20, (p) => call(p, 'POST', `/matches/${code}/join`, {}));
  const server = watchServer();
  await call(host, 'POST', `/matches/${code}/start`, {});
  // Wait for the start's countdown, then every player looks once.
  await new Promise((r) => setTimeout(r, 12_000));
  const before = await summaries(players, code);
  const jumpStarted = Date.now();
  await call(host, 'POST', '/dev/time-travel', { code, ms: DAY });
  const jumpMs = Date.now() - jumpStarted;
  const after = await summaries(players, code);
  await server.stop();
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
        jumpAheadOneDayMs: jumpMs,
        firstLook: before,
        awaySummaryAfterJump: after,
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
