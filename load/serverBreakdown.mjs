/**
 * @file   load/serverBreakdown.mjs
 * @module load
 * @brief  Where a tap's time goes on the server, and what the live updates cost per draw (12 §5).
 *
 * Responsibility: read the server's tap histograms (sbr_tap_*: the gateway's match lookup,
 *                 the wait from arrival to the batch, the batch's decide, append and publish,
 *                 the whole tap until its answer, the batch size, the round trips per stored
 *                 batch of taps) at the start and the end of
 *                 a run and print, per step, how many, the mean and the p95 (the upper edge of
 *                 the histogram bucket that holds it). What the client measures beyond
 *                 "handled" is the socket transport and the event loops of both sides. From the
 *                 live-update metrics (sbr_live_*), per draw: the state fetches, the time spent
 *                 building fetch answers and frames, and the bytes each sent.
 * Depends on:     ./common.mjs (BASE)
 * Used by:        ./drawRun.mjs
 * Spec:           docs/spec/12-testing-strategy.md §5
 */
import { BASE } from './common.mjs';

const STEPS = [
  ['lookup in the gateway', 'sbr_tap_lookup_seconds', ''],
  ['wait for the batch', 'sbr_tap_wait_seconds', ''],
  ['batch: decide', 'sbr_tap_batch_seconds', 'phase="decide"'],
  ['batch: append (transaction)', 'sbr_tap_batch_seconds', 'phase="append"'],
  ['batch: publish', 'sbr_tap_batch_seconds', 'phase="publish"'],
  ['whole tap on the server', 'sbr_tap_handled_seconds', ''],
  ['taps per batch', 'sbr_tap_batch_size', ''],
  ['round trips per tap batch', 'sbr_store_append_round_trips', 'kind="taps"'],
];

export async function serverSnapshot() {
  return fetch(`${BASE}/metrics`)
    .then((r) => r.text())
    .catch(() => '');
}

// One histogram's buckets, sum and count from the metrics text.
function histogram(text, name, label) {
  const wanted = (line) => label === '' || line.includes(label);
  const buckets = [];
  let sum = 0;
  let count = 0;
  for (const line of text.split('\n')) {
    if (!line.startsWith(name) || !wanted(line)) continue;
    const value = Number(line.slice(line.lastIndexOf(' ') + 1));
    const le = /le="([^"]+)"/.exec(line)?.[1];
    if (line.startsWith(`${name}_bucket`) && le !== undefined) buckets.push([Number(le), value]);
    else if (line.startsWith(`${name}_sum`)) sum = value;
    else if (line.startsWith(`${name}_count`)) count = value;
  }
  return { buckets, sum, count };
}

function step(before, after, name, label, seconds) {
  const a = histogram(before, name, label);
  const b = histogram(after, name, label);
  const count = b.count - a.count;
  if (count <= 0) return null;
  const scale = seconds ? 1000 : 1;
  const mean = ((b.sum - a.sum) / count) * scale;
  const p95 = b.buckets.find(([, v], i) => v - (a.buckets[i]?.[1] ?? 0) >= 0.95 * count)?.[0];
  return { count, mean, p95: p95 === undefined ? null : p95 * scale };
}

// Per draw: state fetches, the time building answers and frames, the bytes each sent.
export function liveBreakdown(before, after, draws) {
  if (draws <= 0) return '(no draws)';
  const per = (v) => v / draws;
  const counter = (text, kind) => {
    const line = text.split('\n').find((l) => l.startsWith(`sbr_live_bytes_total{kind="${kind}"}`));
    return line === undefined ? 0 : Number(line.slice(line.lastIndexOf(' ') + 1));
  };
  const lines = ['fetch', 'frame'].map((kind) => {
    const a = histogram(before, 'sbr_live_build_seconds', `kind="${kind}"`);
    const b = histogram(after, 'sbr_live_build_seconds', `kind="${kind}"`);
    const kib = (counter(after, kind) - counter(before, kind)) / 1024;
    return `${`per draw: ${kind === 'fetch' ? 'fetches' : 'frames'}`.padEnd(28)} ${per(b.count - a.count).toFixed(1)} built, ${per((b.sum - a.sum) * 1000).toFixed(0)} ms building, ${per(kib).toFixed(0)} KiB sent`;
  });
  return lines.join('\n');
}

export function tapBreakdown(before, after) {
  return STEPS.map(([label, name, l]) => {
    const seconds = name.endsWith('_seconds');
    const s = step(before, after, name, l, seconds);
    const unit = seconds ? ' ms' : '';
    const p95 = s?.p95 === Infinity ? 'over the last bucket' : `≤ ${String(s?.p95)}${unit}`;
    return s === null
      ? `${label.padEnd(28)} (not measured)`
      : `${label.padEnd(28)} mean ${s.mean.toFixed(seconds ? 0 : 1)}${unit}, p95 ${p95} (${String(s.count)})`;
  }).join('\n');
}
