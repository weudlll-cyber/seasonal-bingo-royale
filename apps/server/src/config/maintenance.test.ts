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
    expect(on()).toBeNull();
    writeFileSync(path.join(dir, 'maintenance'), '');
    t = 1_000;
    expect(on()).toBeNull();
    t = 2_000;
    expect(on()).toEqual({ reason: null });
    rmSync(path.join(dir, 'maintenance'));
    t = 4_000;
    expect(on()).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });

  it("carries the operator's reason, trimmed and at most 200 characters", () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sbr-data-'));
    writeFileSync(path.join(dir, 'maintenance'), '  Database upgrade, back at 22:00 \n');
    expect(maintenanceFlag(dir)()).toEqual({ reason: 'Database upgrade, back at 22:00' });
    writeFileSync(path.join(dir, 'maintenance'), 'x'.repeat(300));
    expect(maintenanceFlag(dir)()?.reason).toHaveLength(200);
    rmSync(dir, { recursive: true, force: true });
  });
});
