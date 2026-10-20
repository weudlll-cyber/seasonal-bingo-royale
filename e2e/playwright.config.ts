/**
 * @file   e2e/playwright.config.ts
 * @module e2e
 * @brief  Playwright config: three browsers against the dev server and player client.
 *
 * Responsibility: start PostgreSQL (global setup), the server on 3900 and the player
 *                 client on 5390, then run the specs in Chromium, Firefox and WebKit at a
 *                 phone viewport. Locally an already-running stack is reused.
 * Depends on:     @playwright/test, ./devStack, ./globalSetup
 * Spec:           docs/spec/12-testing-strategy.md §2, §4; docs/spec/15-implementation-plan.md WP-08
 */
import { defineConfig, devices } from '@playwright/test';

import { CLIENT_URL, REPO_ROOT, SERVER_URL, databaseUrl } from './devStack.js';

const CI = process.env['CI'] !== undefined;

export default defineConfig({
  testDir: '.',
  outputDir: '../test-results',
  globalSetup: './globalSetup.ts',
  timeout: 90_000,
  forbidOnly: CI,
  retries: 0,
  // The manual-marking spec measures a 3 s speed window; more workers starve the browsers.
  workers: 3,
  reporter: 'list',
  use: { baseURL: CLIENT_URL, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit-mobile', use: { ...devices['iPhone 13'] } },
  ],
  webServer: [
    {
      command: 'pnpm --filter @sbr/server start',
      cwd: REPO_ROOT,
      url: `${SERVER_URL}/readyz`,
      env: { DATABASE_URL: databaseUrl(), SBR_PORT: '3900', SBR_LOG_LEVEL: 'warn' },
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @sbr/web dev',
      cwd: REPO_ROOT,
      url: CLIENT_URL,
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
  ],
});
