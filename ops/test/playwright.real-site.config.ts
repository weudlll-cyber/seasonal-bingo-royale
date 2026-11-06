/**
 * @file   ops/test/playwright.real-site.config.ts
 * @module ops/test
 * @brief  Playwright for the rehearsal against the real website (./real-site.sh), not CI.
 *
 * Responsibility: one Chromium in a container on the rehearsal's network: https://example.org
 *                 through the test DNS; the certificate is Pebble's (the test's Let's Encrypt),
 *                 which the browser does not know, so certificate errors are ignored here while
 *                 the server-side checks verify the chain with Pebble's root. One worker, the
 *                 phases run one at a time (`--grep`), long timeouts for the website's poll.
 * Used by:        ./real-site.sh (copied with ./realSite.spec.ts into the browser container)
 * Spec:           docs/spec/12-testing-strategy.md §4
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'realSite.spec.ts',
  workers: 1,
  timeout: 10 * 60_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  use: {
    baseURL: 'https://example.org',
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 800 },
    screenshot: 'only-on-failure',
  },
  // One folder per phase: a later phase must not clear an earlier one's screenshots.
  outputDir: `/state/results-${process.env['PHASE'] ?? 'any'}`,
});
