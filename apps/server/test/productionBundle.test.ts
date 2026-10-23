/**
 * @file   apps/server/test/productionBundle.test.ts
 * @module server/test
 * @brief  The production builds of server and player client carry no development code.
 *
 * Responsibility: build the server bundle (build.mjs) and the player client (vite build)
 *                 into temporary folders and fail when any shipped file (source maps
 *                 aside: they quote the sources, comments included) contains a marker of
 *                 development code: the Quick Test route or page, the dev sign-in menu,
 *                 or the development server address.
 * Depends on:     vitest, node:child_process, node:fs
 * Spec:           docs/spec/09-deployment-architecture.md §1; docs/spec/03-security-architecture.md §13
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

const DEV_MARKERS = ['dev/quicktest', 'dev-sign-in', 'Quick Test', '127.0.0.1:3900'];
const SERVER_DIR = path.resolve(import.meta.dirname, '..');
const WEB_DIR = path.resolve(SERVER_DIR, '../web');
const out = mkdtempSync(path.join(tmpdir(), 'sbr-bundle-'));

afterAll(() => {
  rmSync(out, { recursive: true, force: true });
});

// As the Dockerfile builds: Vitest's NODE_ENV=test would make Vite build in development mode.
function run(cwd: string, args: readonly string[]): void {
  const env = { ...process.env, NODE_ENV: 'production' };
  const result = spawnSync(process.execPath, args, { cwd, env, encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
}

// "file: marker" for every shipped file below <dir> that holds a marker.
function devMarkersIn(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || entry.name.endsWith('.map')) continue;
    const file = path.join(entry.parentPath, entry.name);
    const text = readFileSync(file, 'latin1');
    for (const marker of DEV_MARKERS) {
      if (text.includes(marker)) found.push(`${path.relative(dir, file)}: ${marker}`);
    }
  }
  return found;
}

describe('production bundles', () => {
  it('leave the development modules out of the server bundle', () => {
    const dir = path.join(out, 'server');
    run(SERVER_DIR, ['build.mjs', dir]);
    expect(readdirSync(dir)).toContain('main.js');
    expect(devMarkersIn(dir)).toEqual([]);
  }, 60_000);

  it('leave Quick Test, the dev sign-in and the dev server address out of the client', () => {
    const dir = path.join(out, 'web');
    const vite = path.join(WEB_DIR, 'node_modules/vite/bin/vite.js');
    run(WEB_DIR, [vite, 'build', '--outDir', dir, '--emptyOutDir', '--logLevel', 'error']);
    expect(readdirSync(dir)).toContain('index.html');
    expect(devMarkersIn(dir)).toEqual([]);
  }, 120_000);
});
