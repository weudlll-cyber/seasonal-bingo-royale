/**
 * @file   apps/server/src/olderUpdate.test.ts
 * @module server
 * @brief  An install from before the kit's admin command accepts this version.
 *
 * Responsibility: that `sbr update` (master d7d841e and ff6d090) takes a version only where it
 *                 holds ops/lib/db-roles.sql, and runs whatever it finds there against the
 *                 database: the file stays, holding no statement.
 * Depends on:     node:fs, vitest
 * Spec:           docs/spec/09-deployment-architecture.md §4
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

describe("an older install's update", () => {
  it('finds ops/lib/db-roles.sql, which changes nothing', () => {
    const file = fileURLToPath(new URL('../../../ops/lib/db-roles.sql', import.meta.url));
    const statements = readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.startsWith('--'));
    expect(statements).toEqual([]);
  });
});
