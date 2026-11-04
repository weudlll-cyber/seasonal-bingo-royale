/**
 * @file   load/loadcheck.mjs
 * @module load
 * @brief  The load generator of `sbr loadcheck`: one realtime royale against a production install.
 *
 * Responsibility: bundled into the app image as dist/loadcheck.js (apps/server/build.mjs) and
 *                 run by `sbr loadcheck` in a short-lived container on the stack's internal
 *                 network: reads the temporary accounts the operator CLI made (host, players,
 *                 spectators with their session cookies) from standard input, plays one realtime
 *                 royale with the published default ruleset (./drawRun.mjs: draws every 4 s,
 *                 every player tapping inside the speed window, the spectators watching) for at
 *                 most `minutes`, has the host abort it, and prints the measures with the
 *                 criteria of 12 §5. The app's address comes from SBR_LOAD_BASE (with the base
 *                 path), the origin its checks accept from SBR_LOAD_ORIGIN. Removing the accounts
 *                 is the CLI's (`loadcheck cleanup`), also when this run fails.
 *                 Usage: node dist/loadcheck.js [minutes=10] [tapEvery=1] < accounts.json
 * Depends on:     ./drawRun.mjs
 * Used by:        ops/lib/loadcheck.sh
 * Spec:           docs/spec/12-testing-strategy.md §5; docs/spec/09-deployment-architecture.md §4
 */
import { readFileSync } from 'node:fs';

import { runDrawCheck } from './drawRun.mjs';

const accounts = JSON.parse(readFileSync(0, 'utf8'));
const minutes = Number(process.argv[2] ?? 10);
const tapEvery = Number(process.argv[3] ?? 1);

const ms = (v) => (v === null ? '-' : `${String(Math.round(v))} ms`);
const line = (label, s, criterion = '') =>
  `${label.padEnd(28)} p50 ${ms(s.p50)}, p95 ${ms(s.p95)}, p99 ${ms(s.p99)} (${String(s.n)})${criterion}`;

function print(r) {
  const e = r.errors;
  console.log(
    [
      `match ${r.code}: ${String(r.players)} players, ${String(r.spectators)} spectators, ${r.minutes.toFixed(1)} min, ${String(r.rounds)} round(s) ended`,
      line('draw to screen, players', r.frameLatencyMs, '  [criterion p95 < 500 ms, p99 < 1 s]'),
      line('draw to screen, spectators', r.spectatorFrameLatencyMs),
      line('tap acknowledgement', r.tapAckMs, '  [criterion p95 < 150 ms]'),
      line('gap between draws (4 s)', r.drawGapMs),
      `${'app event-loop lag'.padEnd(28)} p99 max ${ms(r.eventLoopLagP99MsMax)}`,
      `${'errors'.padEnd(28)} http ${String(e.http)}, socket ${String(e.socket)}, taps and watching ${String(e.intent)}${e.examples.length > 0 ? ` (${e.examples.slice(0, 3).join('; ')})` : ''}`,
    ].join('\n'),
  );
}

runDrawCheck({
  host: accounts.host,
  players: accounts.players,
  spectators: accounts.spectators,
  tapEvery,
  minutes,
  create: { title: 'Load check (operator)', countsForLeaderboard: false },
}).then(
  (result) => {
    print(result);
    process.exit(0);
  },
  (e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  },
);
