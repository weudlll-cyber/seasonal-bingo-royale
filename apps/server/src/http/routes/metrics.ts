/**
 * @file   apps/server/src/http/routes/metrics.ts
 * @module server/http
 * @brief  Prometheus /metrics endpoint, scoped to its own Registry.
 *
 * Responsibility: expose process metrics, placeholder sbr_* gauges and the tap breakdown
 *                 (12 §5: the gateway's match lookup, the wait in the match's queue, the
 *                 batch's decide, append and publish, the batch size, the whole tap until its
 *                 answer) and the live updates' cost (state fetches, the time spent building
 *                 fetch answers and room frames, the bytes each sends) in Prometheus text format, to scrapers inside the server only: a request that came
 *                 through a proxy (X-Forwarded-For) gets 404, in every install type (audit
 *                 S8). Later work packages add the full metric catalogue of 08 §6.
 * Depends on:     prom-client, fastify
 * Used by:        ../app.ts
 * Spec:           docs/spec/08-devops-architecture.md §6
 */
import type { FastifyInstance } from 'fastify';
import type { TapBatchTiming } from '@sbr/application';
import { Counter, Registry, collectDefaultMetrics, Gauge, Histogram } from 'prom-client';

export interface TapMetrics {
  // In milliseconds, as the clock gives them; the histograms hold seconds.
  readonly lookup: (ms: number) => void;
  readonly handled: (ms: number) => void;
  readonly batch: (timing: TapBatchTiming) => void;
}

// What the live updates cost the server (12 §5): `kind` is a state fetch's answer or a frame.
export interface LiveMetrics {
  readonly built: (kind: 'fetch' | 'frame', ms: number, bytes: number) => void;
}

export interface MetricsHandle {
  readonly registry: Registry;
  readonly matchesRunning: Gauge;
  readonly taps: TapMetrics;
  readonly live: LiveMetrics;
}

function liveMetrics(registry: Registry): LiveMetrics {
  const built = new Histogram({
    name: 'sbr_live_build_seconds',
    help: 'Building a state answer or a frame, serialized.',
    labelNames: ['kind'],
    buckets: SECONDS,
    registers: [registry],
  });
  const bytes = new Counter({
    name: 'sbr_live_bytes_total',
    help: 'Bytes of state answers, and of frames times their recipients.',
    labelNames: ['kind'],
    registers: [registry],
  });
  return {
    built: (kind, ms, size) => {
      built.observe({ kind }, ms / 1000);
      bytes.inc({ kind }, size);
    },
  };
}

const SECONDS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.15, 0.25, 0.5, 1, 2, 4, 8];

function tapMetrics(registry: Registry): TapMetrics {
  const histogram = (name: string, help: string, labelNames: string[] = []) =>
    new Histogram({ name, help, labelNames, buckets: SECONDS, registers: [registry] });
  const lookup = histogram('sbr_tap_lookup_seconds', 'A tap in the gateway before the engine.');
  const wait = histogram('sbr_tap_wait_seconds', "A tap's wait from arrival to its batch.");
  const phase = histogram('sbr_tap_batch_seconds', 'A batch of taps, per phase.', ['phase']);
  const handled = histogram('sbr_tap_handled_seconds', 'A tap from the gateway to its answer.');
  const size = new Histogram({
    name: 'sbr_tap_batch_size',
    help: 'Taps applied in one batch.',
    buckets: [1, 2, 5, 10, 20, 50, 100, 200],
    registers: [registry],
  });
  return {
    lookup: (ms) => {
      lookup.observe(ms / 1000);
    },
    handled: (ms) => {
      handled.observe(ms / 1000);
    },
    batch: (t) => {
      for (const w of t.waitsMs) wait.observe(w / 1000);
      phase.observe({ phase: 'decide' }, t.decideMs / 1000);
      phase.observe({ phase: 'append' }, t.appendMs / 1000);
      phase.observe({ phase: 'publish' }, t.publishMs / 1000);
      size.observe(t.size);
    },
  };
}

export function createMetrics(): MetricsHandle {
  const registry = new Registry();
  // Default Node metrics (CPU, memory, GC, event loop lag) under the "sbr_" prefix.
  collectDefaultMetrics({ register: registry, prefix: 'sbr_' });
  const matchesRunning = new Gauge({
    name: 'sbr_matches_running',
    help: 'Number of matches currently in state=running.',
    registers: [registry],
  });
  return { registry, matchesRunning, taps: tapMetrics(registry), live: liveMetrics(registry) };
}

export function registerMetrics(app: FastifyInstance, metrics: MetricsHandle): void {
  app.get('/metrics', async (request, reply) => {
    // Only for scrapers inside the server: every proxy of ours (Caddy, the website's Caddy,
    // the nginx example) adds X-Forwarded-For, so a request from outside never sees it.
    if (request.headers['x-forwarded-for'] !== undefined) {
      return reply.status(404).send({ code: 'NOT_FOUND' });
    }
    const body = await metrics.registry.metrics();
    return reply.header('content-type', metrics.registry.contentType).send(body);
  });
}
