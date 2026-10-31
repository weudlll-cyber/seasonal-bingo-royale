/**
 * @file   vitest.config.ts
 * @module repo
 * @brief  Root Vitest config: every workspace package and app is one test project.
 *
 * Responsibility: let "pnpm test" run all projects in one Vitest process, on half the
 *                 cores; the server's integration tests (one database each) are their own
 *                 project, one file at a time with longer timeouts, after the others. "pnpm test:coverage"
 *                 measures domain and application against 12 §2; vitest.integration.config
 *                 measures the server under its integration tests.
 * Depends on:     apps/server/vitest.config (the server's unit tests)
 * Used by:        ./vitest.integration.config
 * Spec:           docs/spec/12-testing-strategy.md §2, docs/spec/10-repository-structure.md §1
 */
import { defineConfig, type TestProjectInlineConfiguration } from 'vitest/config';

const INTEGRATION = 'test/**/*.integration.test.ts';

// The server's integration tests: each file starts its own PostgreSQL container, so they
// run one file at a time, after the other projects, and get time for slow starts.
export const serverIntegration: TestProjectInlineConfiguration = {
  // Takes the root's options (inline projects do not by default).
  extends: true,
  test: {
    name: '@sbr/server:integration',
    root: 'apps/server',
    include: [INTEGRATION],
    fileParallelism: false,
    // A serial project runs in its own group: after the other projects have finished.
    sequence: { groupOrder: 1 },
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
};

export default defineConfig({
  test: {
    // Each folder becomes a project named after its package.json "name" (e.g. @sbr/domain);
    // the server's folder project leaves its integration tests to serverIntegration.
    projects: ['packages/*', 'apps/*', serverIntegration],
    // Half the cores: with one fork per core beside the integration tests' databases, jsdom
    // tests that take 0.3 s alone passed 5 s and timed out (NIGHT-4: slowest test 3.8 s at
    // 13 workers, 2.6 s at 7).
    maxWorkers: '50%',
    // Off for "pnpm test"; "pnpm test:coverage" (CI) turns it on. The targets of 12 §2 (the
    // domain's branch target is 85 %: its remaining branches are guards, see 12 §2).
    coverage: {
      provider: 'v8',
      include: ['packages/domain/src/**', 'packages/application/src/**'],
      exclude: ['**/*.test.ts', 'packages/application/src/match/fakes.ts'],
      reporter: ['text-summary'],
      thresholds: {
        'packages/domain/src/**': { lines: 95, branches: 85 },
        'packages/application/src/**': { lines: 85, branches: 85 },
      },
    },
  },
});
