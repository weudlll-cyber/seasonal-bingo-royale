/**
 * @file   apps/embed-loader/src/index.test.ts
 * @module embed-loader
 * @brief  Smoke test proving Vitest discovers this workspace project.
 *
 * Responsibility: import the package entry point and check its identity.
 * Depends on:     ./index
 * Spec:           docs/spec/12-testing-strategy.md
 */
import { describe, expect, it } from 'vitest';

import { PACKAGE_NAME } from './index.js';

describe('@sbr/embed-loader', () => {
  it('is discovered by the test runner', () => {
    expect(PACKAGE_NAME).toBe('@sbr/embed-loader');
  });
});
