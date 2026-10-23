/**
 * @file   vitest.config.ts
 * @module repo
 * @brief  Root Vitest config: every workspace package and app is one test project.
 *
 * Responsibility: let "pnpm test" run all projects in one Vitest process, on half the
 *                 cores so timing-free tests are not starved. Replaces the
 *                 vitest.workspace.ts of 10 §1, which Vitest 4+ no longer supports.
 * Spec:           docs/spec/12-testing-strategy.md, docs/spec/10-repository-structure.md §1
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Each folder becomes a project named after its package.json "name" (e.g. @sbr/domain).
    projects: ['packages/*', 'apps/*'],
    // Half the cores: with one fork per core beside the integration tests' databases, jsdom
    // tests that take 0.3 s alone passed 5 s and timed out (NIGHT-4: slowest test 3.8 s at
    // 13 workers, 2.6 s at 7).
    maxWorkers: '50%',
  },
});
