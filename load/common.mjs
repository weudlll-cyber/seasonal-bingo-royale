/**
 * @file   load/common.mjs
 * @module load
 * @brief  What the load checks share: the target, dev sign-in, API calls and the server's figures.
 *
 * Responsibility: the server to load (SBR_LOAD_BASE with the base path, SBR_LOAD_ORIGIN: the
 *                 test server through ./testDefaults.mjs, the development server through
 *                 ./devDefaults.mjs, a production install through
 *                 `sbr loadcheck`) and its WebSocket address; sign in a development account and call the
 *                 API as it (cookie, CSRF token, origin), watch the server's CPU, memory and
 *                 event-loop lag, and count errors with a few examples. Batches and latencies
 *                 (p50/p95/p99/max) are the kit's (`inBatches`, `latencies`, K73).
 * Depends on:     @seasonal/kit/testing (watchServer); Node's fetch
 * Used by:        ./drawRun.mjs, ./drawLatency.mjs, ./loadcheck.mjs, ./spectatorStream.mjs,
 *                 ./asyncJump.mjs, ../apps/server/demo-league.mjs (BASE, ORIGIN)
 * Spec:           docs/spec/06-realtime-architecture.md §8; docs/spec/08-devops-architecture.md §6
 */
import { watchServer as watchMetrics } from '@seasonal/kit/testing';

// The local scripts set both through ./testDefaults.mjs or ./devDefaults.mjs, `sbr loadcheck` through its
// container's environment.
if (process.env.SBR_LOAD_BASE === undefined || process.env.SBR_LOAD_ORIGIN === undefined) {
  throw new Error('SBR_LOAD_BASE and SBR_LOAD_ORIGIN must be set (or import ./testDefaults.mjs)');
}
export const BASE = process.env.SBR_LOAD_BASE.replace(/\/$/, '');
// The public origin: what a player's page names, and what the WebSocket accepts.
export const ORIGIN = process.env.SBR_LOAD_ORIGIN;
// An HTTP write names the origin it is sent to: the server refuses one naming another host than
// the request's (an install is called by its internal address).
export const WRITES_FROM = { origin: new URL(BASE).origin };

// Socket.IO takes the namespace from the URL's path, so the base path goes into `path`.
export const SOCKET = {
  url: `${new URL(BASE).origin}/play`,
  path: `${new URL(BASE).pathname.replace(/\/$/, '')}/ws`,
};

export const errors = { http: 0, socket: 0, intent: 0, examples: [] };
export function fail(kind, detail) {
  errors[kind] += 1;
  if (errors.examples.length < 10) errors.examples.push(`${kind}: ${detail}`);
}

// One signed-in client: its session cookie, CSRF token and account id.
export async function signIn(as) {
  const r = await fetch(`${BASE}/api/v1/dev/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...WRITES_FROM },
    body: JSON.stringify({ as }),
  });
  const cookie = (r.headers.get('set-cookie') ?? '').split(';')[0];
  const { displayName } = await r.json();
  const session = await (await fetch(`${BASE}/api/v1/session`, { headers: { cookie } })).json();
  return { as, cookie, csrf: session.csrfToken, name: displayName };
}

export async function call(client, method, path, body) {
  const r = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: {
      cookie: client.cookie,
      ...WRITES_FROM,
      'x-csrf-token': client.csrf,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!r.ok) fail('http', `${method} ${path} → ${String(r.status)}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}

// Samples the server's CPU (in cores), memory and event-loop lag from its /metrics every 2 s
// until stop(), which sums them up (the kit's sampler; Bingo's metrics carry the prefix sbr_).
export const watchServer = () => watchMetrics({ url: `${BASE}/metrics`, prefix: 'sbr_' });

// The server's figures in a load check's report.
export const serverFigures = (load) => ({
  serverCpuCores: { avg: load.cpuMeanCores, max: load.cpuPeakCores },
  serverRssMbMax: load.rssPeakMiB,
  eventLoopLagP99MsMax: load.loopLagP99PeakMs,
});
