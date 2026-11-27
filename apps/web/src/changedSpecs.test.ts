/**
 * @file   apps/web/src/changedSpecs.test.ts
 * @module web
 * @brief  A pull request runs the browser specs of what it changed (kit K106).
 *
 * Responsibility: the choice of ../../../e2e/changedSpecs: documents and unit tests choose
 *                 nothing, a spec chooses itself, a screen's folder its specs, anything else
 *                 every spec; and every spec the choice names exists.
 * Depends on:     node:fs, vitest, e2e/changedSpecs
 * Spec:           docs/spec/12-testing-strategy.md §4
 */
import { existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { AREAS, specsFor } from '../../../e2e/changedSpecs.js';

describe("a pull request's browser specs", () => {
  it('are none for documents, unit tests and server operations', () => {
    expect(
      specsFor(['docs/MORNING.md', 'apps/web/src/shell/shell.test.tsx', 'ops/lib/backup.sh']),
    ).toEqual([]);
  });

  it('are a changed spec itself and the specs of a changed screen', () => {
    expect(specsFor(['e2e/topBar.spec.ts'])).toEqual(['topBar.spec.ts']);
    expect(specsFor(['apps/web/src/league/LeaderboardPage.tsx'])).toEqual(['leaderboard.spec.ts']);
  });

  it('are all of them for the match screens, the server and anything unknown', () => {
    for (const file of [
      'apps/web/src/game/Lobby.tsx',
      'apps/server/src/main.ts',
      'packages/domain/src/index.ts',
      'e2e/realGame.ts',
      'pnpm-lock.yaml',
      'something/new.txt',
    ])
      expect(specsFor([file]), file).toBe('all');
  });

  it('name only specs that exist', () => {
    for (const spec of AREAS.flatMap((a) => a.specs))
      expect(existsSync(new URL(`../../../e2e/${spec}`, import.meta.url)), spec).toBe(true);
  });
});
