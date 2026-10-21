/**
 * @file   apps/server/test/server.integration.test.ts
 * @module server
 * @brief  End-to-end integration test: Fastify app wired to a Testcontainers Postgres.
 *
 * Responsibility: start a real PostgreSQL 17 in Docker, run every migration, boot the
 *                 Fastify app, and check that /healthz, /readyz, /metrics, the placeholder
 *                 page and a 404 all behave as the specification says — including the
 *                 security headers (03 §13, 12 §6) and the problem+json content type.
 * Depends on:     vitest, ./harness
 * Spec:           docs/spec/12-testing-strategy.md §2, docs/spec/15-implementation-plan.md WP-03
 */
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { migrate, type DbPool } from '../src/index.js';
import { startHarness, stopHarness, SUITE_TIMEOUT_MS, type Harness } from './harness.js';

let harness: Harness;
const app = (): FastifyInstance => harness.built.fastify;
const pool = (): DbPool => harness.pool;

beforeAll(async () => {
  harness = await startHarness();
  expect(harness.applied).toContain('0001_initial.sql');
}, SUITE_TIMEOUT_MS);

afterAll(async () => {
  await stopHarness(harness);
}, SUITE_TIMEOUT_MS);

describe('server integration', () => {
  it('answers /healthz with status ok', async () => {
    const response = await app().inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('answers /readyz with status ready once the database is reachable', async () => {
    const response = await app().inject({ method: 'GET', url: '/readyz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ready' });
  });

  it('exposes Prometheus-formatted metrics', async () => {
    const response = await app().inject({ method: 'GET', url: '/metrics' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toContain('sbr_matches_running');
  });

  it('renders the placeholder page with the dev badge in non-production', async () => {
    const response = await app().inject({ method: 'GET', url: '/' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('Seasonal Bingo Royale');
    expect(response.body).toMatch(/Bingo.*dev.*0/);
  });

  it('ships baseline security headers', async () => {
    const response = await app().inject({ method: 'GET', url: '/' });
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBeDefined();
    expect(response.headers['referrer-policy']).toBe('no-referrer');
  });

  it('returns problem+json on 404', async () => {
    const response = await app().inject({ method: 'GET', url: '/does-not-exist' });
    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
    const body = response.json<{ code: string; status: number; title: string; type: string }>();
    expect(body.code).toBe('NOT_FOUND');
    expect(body.status).toBe(404);
  });
});

describe('database bootstrap', () => {
  it('records the migration in sbr.schema_migrations and is idempotent', async () => {
    const second = await migrate(pool());
    expect(second).toEqual([]);
    const result = await pool().query<{ id: string }>('SELECT id FROM sbr.schema_migrations');
    expect(result.rows.map((row) => row.id)).toContain('0001_initial.sql');
  });

  it('seeds the roles of the role catalogue, guest included', async () => {
    const result = await pool().query<{ id: string }>('SELECT id FROM sbr.roles ORDER BY id');
    expect(result.rows.map((row) => row.id)).toEqual([
      'game_admin',
      'guest',
      'moderator',
      'organizer',
      'player',
      'security_admin',
      'super_admin',
    ]);
  });
});
