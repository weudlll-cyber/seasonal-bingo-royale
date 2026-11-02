/**
 * @file   load/common.mjs
 * @module load
 * @brief  What the load checks share: dev sign-in, API calls, batches, percentiles, server samples.
 *
 * Responsibility: sign in a development account and call the API as it (cookie, CSRF token,
 *                 origin), run calls in batches, sum up latencies (p50/p95/p99/max), sample the
 *                 server's CPU, memory and event-loop lag from /metrics every 2 s, and count
 *                 errors with a few examples.
 * Depends on:     nothing (Node's fetch)
 * Used by:        ./drawLatency.mjs, ./spectatorStream.mjs
 * Spec:           docs/spec/06-realtime-architecture.md §8; docs/spec/08-devops-architecture.md §6
 */
export const BASE = 'http://127.0.0.1:3900';
export const ORIGIN = 'http://localhost:5390';

export const errors = { http: 0, socket: 0, intent: 0, examples: [] };
export function fail(kind, detail) {
  errors[kind] += 1;
  if (errors.examples.length < 10) errors.examples.push(`${kind}: ${detail}`);
}

// One signed-in client: its session cookie, CSRF token and account id.
export async function signIn(as) {
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

export async function call(client, method, path, body) {
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

export async function inBatches(items, size, fn) {
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

export function summary(values) {
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
export function watchServer() {
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
