/**
 * @file   apps/server/src/kitOpsCopy.test.ts
 * @module server
 * @brief  The servers' kit scripts are the pinned kit's ops folder, file for file (K61, K71).
 *
 * Responsibility: ops/kit/ is a copy of @seasonal/kit's ops/ with its layout (a server has no
 *                 node_modules, and the kit's scripts load lib/ beside themselves): the same
 *                 files with the same bytes. A new kit version must bring its folder along, and
 *                 the copy is never edited.
 * Depends on:     node:fs, vitest
 * Used by:        ops/lib/config.sh installs the copy
 * Spec:           docs/spec/09-deployment-architecture.md §4, §6
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// Every file under a folder with its content, by its path inside the folder.
const filesOf = (relative: string): Record<string, string> => {
  const root = fileURLToPath(new URL(relative, import.meta.url));
  const entries = readdirSync(root, { recursive: true, withFileTypes: true });
  return Object.fromEntries(
    entries
      .filter((e) => e.isFile())
      .map((e) => {
        const full = `${e.parentPath}/${e.name}`.replaceAll('\\', '/');
        const name = full.slice(root.replaceAll('\\', '/').replace(/\/$/, '').length + 1);
        return [name, readFileSync(full, 'utf8')];
      }),
  );
};

describe("the kit's operations folder", () => {
  it("is installed as the pinned kit's, file for file", () => {
    expect(filesOf('../../../ops/kit')).toEqual(filesOf('../node_modules/@seasonal/kit/ops'));
  });
});
