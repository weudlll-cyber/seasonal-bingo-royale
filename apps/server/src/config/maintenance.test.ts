/**
 * @file   apps/server/src/config/maintenance.test.ts
 * @module server/config
 * @brief  The maintenance flag follows its file, checked at most every 2 seconds.
 *
 * Responsibility: off without the file; on within 2 seconds of `sbr maintenance on`
 *                 creating it, off again within 2 seconds of its removal.
 * Depends on:     vitest, node:fs, ./maintenance
 * Spec:           docs/spec/09-deployment-architecture.md §4
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { maintenanceFlag } from './maintenance.js';

describe('the maintenance flag', () => {
  it('follows its file within 2 seconds', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sbr-data-'));
    let t = 0;
    const on = maintenanceFlag(dir, () => t);
    expect(on()).toBe(false);
    writeFileSync(path.join(dir, 'maintenance'), '');
    t = 1_000;
    expect(on()).toBe(false);
    t = 2_000;
    expect(on()).toBe(true);
    rmSync(path.join(dir, 'maintenance'));
    t = 4_000;
    expect(on()).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });
});
