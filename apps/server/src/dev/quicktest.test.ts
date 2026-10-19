/**
 * @file   apps/server/src/dev/quicktest.test.ts
 * @module server/dev
 * @brief  Unit test for the Quick Test runner (WP-08 acceptance smoke).
 *
 * Responsibility: feed the runner three fixed seeds and check the invariants that
 *                 matter for the owner's manual acceptance: deterministic output,
 *                 awards for every ticked prize, placement 1..N without gaps.
 * Depends on:     ./quicktest
 * Spec:           docs/spec/15-implementation-plan.md WP-08
 */
import { describe, expect, it } from 'vitest';

import { runQuickTest } from './quicktest.js';

const TICKED = ['rows-1', 'rows-2', 'fourCorners', 'oneDiagonal', 'fullCard'];

describe('runQuickTest', () => {
  it.each(['royale', 'classicSeasons', 'classic'] as const)(
    'runs end-to-end for %s and is deterministic',
    (gameType) => {
      const first = runQuickTest({
        gameType,
        playerCount: 4,
        seedText: 'spring-10',
        tickedPrizes: TICKED,
      });
      const second = runQuickTest({
        gameType,
        playerCount: 4,
        seedText: 'spring-10',
        tickedPrizes: TICKED,
      });
      expect(first).toEqual(second);
      // Every ticked prize has at least one award, placement is 1..N.
      const awardedKeys = new Set(first.awards.map((a) => a.prizeKey));
      for (const key of TICKED) expect(awardedKeys.has(key)).toBe(true);
      expect(first.players.map((p) => p.place).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
    },
  );
});
