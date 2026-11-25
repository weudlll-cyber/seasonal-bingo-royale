/**
 * @file   apps/server/src/kitBackupCopy.test.ts
 * @module server
 * @brief  The servers' backup script is the pinned kit's, byte for byte (K61).
 *
 * Responsibility: ops/lib/kit-backup.sh is a copy of @seasonal/kit's ops/backup.sh (a server has
 *                 no node_modules, and an update installs only ops/lib); a new kit version must
 *                 bring its script along, and the copy is never edited.
 * Depends on:     node:fs, vitest
 * Used by:        ops/lib/backup.sh runs the copy
 * Spec:           docs/spec/09-deployment-architecture.md §6
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

describe("the kit's backup script", () => {
  it("is installed as the pinned kit's, unchanged", () => {
    const ours = read('../../../ops/lib/kit-backup.sh');
    expect(ours).toBe(read('../node_modules/@seasonal/kit/ops/backup.sh'));
  });
});
