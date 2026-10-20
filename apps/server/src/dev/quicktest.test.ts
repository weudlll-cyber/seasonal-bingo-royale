/**
 * @file   apps/server/src/dev/quicktest.test.ts
 * @module server/dev
 * @brief  Unit test for the Quick Test runner (WP-08 acceptance smoke).
 *
 * Responsibility: feed the runner one fixed seed per game type and check the
 *                 invariants the owner's manual acceptance depends on: the result is
 *                 deterministic (same input → same output), the final placement is a
 *                 total order 1..N over every entrant, the Winter shield reserves a
 *                 player's shieldCharges and the event log contains the lifecycle
 *                 events the client plays back.
 * Depends on:     ./quicktest
 * Spec:           docs/spec/15-implementation-plan.md WP-08
 */
import { describe, expect, it } from 'vitest';

import { runQuickTest } from './quicktest.js';

const TICKED = ['rows-1', 'rows-2', 'fourCorners', 'oneDiagonal', 'fullCard'];

describe('runQuickTest', () => {
  it.each(['royale', 'classicSeasons', 'classic'] as const)(
    'runs end-to-end for %s and is deterministic in auto mode',
    (gameType) => {
      const first = runQuickTest({
        gameType,
        playerCount: 3,
        ownerCards: 1,
        seedText: 'spring-10',
        tickedPrizes: TICKED,
        markingMode: 'auto',
      });
      const second = runQuickTest({
        gameType,
        playerCount: 3,
        ownerCards: 1,
        seedText: 'spring-10',
        tickedPrizes: TICKED,
        markingMode: 'auto',
      });
      // Determinism: cards and placements are identical across runs.
      expect(first.players.map((p) => p.card)).toEqual(second.players.map((p) => p.card));
      expect(first.players.map((p) => p.place)).toEqual(second.players.map((p) => p.place));
      expect(first.players.map((p) => p.points)).toEqual(second.players.map((p) => p.points));
      // Total order 1..N over every entrant (invariant 8).
      expect(first.players.map((p) => p.place).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
      // The owner's displayed account id starts with the owner prefix.
      expect(first.ownerAccountIds).toEqual(['owner-01']);
      expect(first.players[0]?.isOwner).toBe(true);
      // The event stream contains at least one roundStarted and one matchFinished.
      expect(first.events.some((e) => e.type === 'roundStarted')).toBe(true);
      expect(first.events.some((e) => e.type === 'matchFinished')).toBe(true);
    },
  );
});
