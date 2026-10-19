/**
 * @file   apps/server/src/index.ts
 * @module server
 * @brief  Public entry point of @sbr/server, re-exports what tests and tooling import.
 *
 * Responsibility: expose the pieces integration tests and future consumers compose
 *                 (buildApp, loadEnv, createPool, migrate). The actual CLI entry
 *                 is ./main.ts and is run from the Dockerfile and `pnpm dev`.
 * Depends on:     ./config/env, ./db/pool, ./db/migrator, ./http/app
 * Used by:        test/* and later packages that depend on @sbr/server
 * Spec:           docs/spec/02-software-architecture.md §3
 */

export const PACKAGE_NAME = '@sbr/server';

export { loadEnv, type Env } from './config/env.js';
export { createPool, pingDatabase, type DbPool } from './db/pool.js';
export { migrate } from './db/migrator.js';
export { buildApp, type App, type AppDeps } from './http/app.js';
