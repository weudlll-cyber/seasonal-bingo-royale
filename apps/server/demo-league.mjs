/**
 * @file   apps/server/demo-league.mjs
 * @module server
 * @brief  Console command for the development demo league: `pnpm demo-league [--remove]`.
 *
 * Responsibility: against the running development server (`pnpm dev`, port 3900): without an
 *                 argument start the demo league (POST /api/v1/dev/demo-league) and wait,
 *                 printing progress, until its three matches have finished (about 3 minutes),
 *                 then name the pages to open; with `--remove` remove the demo accounts again
 *                 (DELETE) and say what went. Development only: the route exists with
 *                 SBR_DEV=1, and this file is not part of any build.
 * Depends on:     ../../load/common.mjs (server address and origin)
 * Used by:        ./package.json and ../../package.json (`demo-league` script)
 * Spec:           docs/spec/01-game-design.md §10; CONTRIBUTING.md (demo league)
 */
import { BASE, ORIGIN } from '../../load/common.mjs';

const ROUTE = `${BASE}/api/v1/dev/demo-league`;
const headers = { origin: ORIGIN };

async function remove() {
  const r = await fetch(ROUTE, { method: 'DELETE', headers });
  if (!r.ok) throw new Error(`removing the demo league failed: ${String(r.status)}`);
  const { removed, aborted } = await r.json();
  console.log(
    `Removed ${String(removed.length)} demo accounts; ${String(aborted)} running matches aborted.`,
  );
  console.log('Finished matches stay in the event log, listed without the removed accounts.');
}

const statusOf = async (code) =>
  (await (await fetch(`${BASE}/api/v1/matches/${code}`, { headers })).json()).status;

async function start() {
  const r = await fetch(ROUTE, { method: 'POST', headers });
  if (r.status !== 202) throw new Error(`starting the demo league failed: ${String(r.status)}`);
  const { accounts, matches } = await r.json();
  console.log(`Accounts ${accounts.join(', ')} play ${matches.join(', ')} (about 3 minutes).`);
  for (;;) {
    const statuses = await Promise.all(matches.map(statusOf));
    console.log(matches.map((code, i) => `${code} ${String(statuses[i])}`).join(' · '));
    if (statuses.every((s) => s === 'finished' || s === 'aborted')) break;
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
  console.log(`Done: ${ORIGIN}/#/leaderboard and ${ORIGIN}/#/players/demo-01`);
}

await (process.argv.includes('--remove') ? remove() : start());
