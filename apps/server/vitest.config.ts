/**
 * @file   apps/server/vitest.config.ts
 * @module server
 * @brief  The server's unit-test project: every test file except the integration tests.
 *
 * Responsibility: the root config (../../vitest.config) picks this folder up like every
 *                 other app; the integration tests (one database each) are left to the
 *                 root's own serial project `@sbr/server:integration`.
 * Depends on:     nothing
 * Used by:        ../../vitest.config (folder project)
 * Spec:           docs/spec/12-testing-strategy.md §2
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@sbr/server',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['test/**/*.integration.test.ts'],
  },
});
