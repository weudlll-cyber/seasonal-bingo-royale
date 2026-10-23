/**
 * @file   apps/server/src/index.ts
 * @module server
 * @brief  Public entry point of @sbr/server, re-exports what tests and tooling import.
 *
 * Responsibility: expose the pieces integration tests and future consumers compose
 *                 (buildApp, loadEnv, createPool, migrate). The actual CLI entry
 *                 is ./main.ts and is run from the Dockerfile and `pnpm dev`.
 * Depends on:     ./config/env, ./db/pool, ./db/migrator, ./http/app
 * Used by:        test/* and later packages that depend on @sbr/server,
 *                 ../test/deployment.integration.test, ../test/harness,
 *                 ../test/matchPersistence.integration.test, ../test/server.integration.test
 * Spec:           docs/spec/02-software-architecture.md §3
 */

export { loadEnv } from './config/env.js';
export { createPool, type DbPool } from './db/pool.js';
export { migrate } from './db/migrator.js';
export { buildApp, type App } from './http/app.js';
