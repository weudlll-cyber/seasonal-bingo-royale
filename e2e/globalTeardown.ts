/**
 * @file   e2e/globalTeardown.ts
 * @module e2e
 * @brief  Throws the browser tests' database away after the run (kit K125).
 *
 * Responsibility: drops the database ./testServer made, its server's open connections included;
 *                 Playwright ends that server right after.
 * Depends on:     ./devStack, ./testDatabase
 * Used by:        ./playwright.config.ts
 * Spec:           docs/spec/12-testing-strategy.md §4
 */
import { TEST_DATABASE } from './devStack.js';
import { dropDatabase } from './testDatabase.js';

export default function globalTeardown(): void {
  dropDatabase(TEST_DATABASE);
}
