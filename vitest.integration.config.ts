/**
 * @file   vitest.integration.config.ts
 * @module repo
 * @brief  The server's integration tests alone, with a coverage report of the server code.
 *
 * Responsibility: run the integration project of ./vitest.config (one file at a time) and
 *                 report which server code they reach, per file and in total; a report
 *                 for CI, no thresholds yet. "pnpm test:integration:coverage".
 * Depends on:     ./vitest.config
 * Spec:           docs/spec/12-testing-strategy.md §2
 */
import { defineConfig } from 'vitest/config';

import { serverIntegration } from './vitest.config.js';

export default defineConfig({
  test: {
    projects: [serverIntegration],
    coverage: {
      provider: 'v8',
      include: ['apps/server/src/**/*.ts'],
      exclude: ['**/*.test.ts'],
      reporter: ['text', 'text-summary'],
      reportsDirectory: 'coverage/integration',
    },
  },
});
