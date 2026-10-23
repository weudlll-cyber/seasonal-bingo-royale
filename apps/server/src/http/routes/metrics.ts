/**
 * @file   apps/server/src/http/routes/metrics.ts
 * @module server/http
 * @brief  Prometheus /metrics endpoint, scoped to its own Registry.
 *
 * Responsibility: expose process metrics and placeholder sbr_* gauges in Prometheus
 *                 text format, to scrapers inside the server only: a request that came
 *                 through a proxy (X-Forwarded-For) gets 404, in every install type (audit
 *                 S8). Later work packages add the full metric catalogue of 08 §6.
 * Depends on:     prom-client, fastify
 * Used by:        ../app.ts
 * Spec:           docs/spec/08-devops-architecture.md §6
 */
import type { FastifyInstance } from 'fastify';
import { Registry, collectDefaultMetrics, Gauge } from 'prom-client';

export interface MetricsHandle {
  readonly registry: Registry;
  readonly matchesRunning: Gauge;
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
  return { registry, matchesRunning };
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
