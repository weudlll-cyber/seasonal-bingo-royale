/**
 * @file   e2e/playwright.config.ts
 * @module e2e
 * @brief  Playwright config: three browsers against the dev server and player client.
 *
 * Responsibility: start PostgreSQL (global setup), the server on 3900 and the player
 *                 client on 5390, then run the specs in Chromium, Firefox and WebKit at a
 *                 phone viewport. The specs that measure time in the browser (speed window,
 *                 missed-number delay, timed draws) run afterwards, one at a time and one
 *                 browser after the other, so no other browser starves their timers (NIGHT-3:
 *                 six of them failed under the full parallel run and passed alone). Locally
 *                 an already-running stack is reused. The acceptance play-through runs only
 *                 with SBR_ACCEPTANCE=1.
 * Depends on:     @playwright/test, ./devStack, ./globalSetup
 * Spec:           docs/spec/12-testing-strategy.md §2, §4; docs/spec/15-implementation-plan.md WP-08
 */
import { defineConfig, devices } from '@playwright/test';

import { CLIENT_URL, REPO_ROOT, SERVER_URL, databaseUrl } from './devStack.js';

const CI = process.env['CI'] !== undefined;

// Specs whose checks depend on browser timers firing on time.
const TIMING = ['missedNumbers.spec.ts', 'drawControl.spec.ts', 'manual.spec.ts', 'newRun.spec.ts'];
const ACCEPTANCE = process.env['SBR_ACCEPTANCE'] === '1' ? [] : ['acceptance/**'];
const BROWSERS = [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  { name: 'webkit-mobile', use: { ...devices['iPhone 13'] } },
] as const;

export default defineConfig({
  testDir: '.',
  // The acceptance play-through (./acceptance) runs only when asked for with
  // SBR_ACCEPTANCE=1, never in CI.
  testIgnore: ACCEPTANCE,
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
    ...BROWSERS.map((b) => ({ ...b, testIgnore: [...ACCEPTANCE, ...TIMING] })),
    // The timing specs: after all others, one test at a time, one browser after another.
    ...BROWSERS.map((b, i) => ({
      ...b,
      name: `${b.name}-timing`,
      testMatch: TIMING,
      workers: 1,
      dependencies:
        i === 0 ? BROWSERS.map((x) => x.name) : [`${BROWSERS[i - 1]?.name ?? ''}-timing`],
    })),
  ],
  webServer: [
    {
      command: 'pnpm --filter @sbr/server start',
      cwd: REPO_ROOT,
      url: `${SERVER_URL}/readyz`,
      // The specs use the development features (quick sign-in, bots, fast rules).
      env: { DATABASE_URL: databaseUrl(), SBR_PORT: '3900', SBR_LOG_LEVEL: 'warn', SBR_DEV: '1' },
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
