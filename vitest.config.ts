/**
 * @file   vitest.config.ts
 * @brief  Root Vitest config: every workspace package and app is one test project.
 *
 * Responsibility: let "pnpm test" run all projects in one Vitest process. Replaces the
 *                 vitest.workspace.ts of 10 §1, which Vitest 4+ no longer supports.
 * Spec:           docs/spec/12-testing-strategy.md, docs/spec/10-repository-structure.md §1
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Each folder becomes a project named after its package.json "name" (e.g. @sbr/domain).
    projects: ['packages/*', 'apps/*'],
  },
});
