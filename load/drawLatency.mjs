/**
 * @file   load/drawLatency.mjs
 * @module load
 * @brief  200-player check against the local development stack: draw latency, tap acknowledgements, server load.
 *
 * Responsibility: against a running stack with development features (server 3900): sign in a
 *                 host, N load players and S spectators (dev sign-in `load-NNN`), run one royale
 *                 with the fast test profile (./drawRun.mjs: 4 s draws, manual marking, every
 *                 `tapEvery`-th player tapping), print the measures, then delete the load
 *                 accounts (DELETE /api/v1/dev/load-accounts). On a production install the
 *                 same run is `sbr loadcheck` (./loadcheck.mjs).
 *                 Usage: node load/drawLatency.mjs [players=200] [spectators=50] [tapEvery=1]
 *                 [minutes=12] (the run ends with the match or after that many minutes)
 * Depends on:     ./common.mjs, ./drawRun.mjs
 * Spec:           docs/spec/12-testing-strategy.md §5; docs/spec/06-realtime-architecture.md §8
 */
import { BASE, inBatches, signIn } from './common.mjs';
import { runDrawCheck } from './drawRun.mjs';

const PLAYERS = Number(process.argv[2] ?? 200);
const SPECTATORS = Number(process.argv[3] ?? 50);
const TAP_EVERY = Number(process.argv[4] ?? 1);
const MINUTES = Number(process.argv[5] ?? 12);

async function main() {
  const loadId = (i) => `load-${String(i + 1).padStart(3, '0')}`;
  const host = await signIn('host');
  const players = await inBatches(
    Array.from({ length: PLAYERS }, (_v, i) => loadId(i)),
    20,
    signIn,
  );
  // Spectators: the next load accounts, signed in but not joined.
  const spectators = await inBatches(
    Array.from({ length: SPECTATORS }, (_v, i) => loadId(PLAYERS + i)),
    20,
    signIn,
  );
  try {
    const result = await runDrawCheck({
      host,
      players,
      spectators,
      tapEvery: TAP_EVERY,
      minutes: MINUTES,
      create: { title: `Load check ${String(PLAYERS)}`, testProfile: 'fast' },
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    const removed = await (
      await fetch(`${BASE}/api/v1/dev/load-accounts`, { method: 'DELETE' })
    ).json();
    console.log(`load accounts removed: ${String(removed.deleted)}`);
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
