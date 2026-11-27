/**
 * @file   e2e/changedSpecs.ts
 * @module e2e
 * @brief  The browser specs a pull request runs: those of what it changed (kit K106).
 *
 * Responsibility: from the changed files (one per line on standard input) the specs to run:
 *                 documents, unit tests, server operations and the acceptance tools choose none;
 *                 a spec chooses itself; a screen's own folder (`AREAS`) its specs; anything
 *                 else, the match screens, the server and the shared packages among it, every
 *                 spec. Printed as one line: `all`, `none` or the file names. The full suite
 *                 runs nightly (.github/workflows/browsers.yml).
 * Depends on:     node:fs
 * Used by:        .github/workflows/ci.yml, apps/web/src/changedSpecs.test.ts
 * Spec:           docs/spec/12-testing-strategy.md §4
 */
import { readFileSync } from 'node:fs';

interface Area {
  readonly folder: string;
  readonly specs: readonly string[];
}

const ADMIN = [
  'adminAccounts',
  'adminHistory',
  'adminLeague',
  'adminMaintenance',
  'adminOverview',
  'adminPresets',
  'adminScreens',
  'adminTechnical',
  'maintenance',
];
const named = (names: readonly string[]) => names.map((n) => `${n}.spec.ts`);

// The folders whose screens only these specs open.
export const AREAS: readonly Area[] = [
  { folder: 'apps/web/src/admin/', specs: named(ADMIN) },
  { folder: 'apps/web/src/account/', specs: named(['account', 'passwordReset', 'websiteLogin']) },
  { folder: 'apps/web/src/league/', specs: named(['leaderboard']) },
];

// What no browser spec reads.
const NONE =
  /^(docs\/|ops\/|load\/|e2e\/acceptance\/|reports\/)|\.md$|\.(test|spec)\.tsx?$|\/test\//;

function specsOf(file: string): readonly string[] | 'all' {
  const spec = /^e2e\/([^/]+\.spec\.ts)$/.exec(file)?.[1];
  if (spec !== undefined) return [spec];
  if (NONE.test(file)) return [];
  return AREAS.find((a) => file.startsWith(a.folder))?.specs ?? 'all';
}

export function specsFor(files: readonly string[]): readonly string[] | 'all' {
  const chosen = new Set<string>();
  for (const file of files) {
    const specs = specsOf(file);
    if (specs === 'all') return 'all';
    for (const spec of specs) chosen.add(spec);
  }
  return [...chosen].sort();
}

// Run as a command: the changed files on standard input.
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/changedSpecs.ts') === true) {
  const specs = specsFor(readFileSync(0, 'utf8').split(/\r?\n/).filter(Boolean));
  console.log(specs === 'all' ? 'all' : specs.length === 0 ? 'none' : specs.join(' '));
}
