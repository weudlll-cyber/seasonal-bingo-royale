/**
 * @file   packages/domain/src/match/seasonCompleteShield.test.ts
 * @module domain/match
 * @brief  A Season Complete whose effect is a shield arms it with its rank margin (audit-3 G6).
 *
 * Responsibility: with a ruleset whose Season Complete effect is a shield, the fired Season
 *                 Complete gives the player the shield's charges and its rank margin (the
 *                 margin stayed 0, so the charge could never save anyone); a Season Complete
 *                 without a shield keeps the margin the player had.
 * Depends on:     vitest, ./evolveScoring, ./matchState, ../seasons/effectState,
 *                 ../../test/builders
 * Spec:           docs/spec/01-game-design.md §8.2, §8.5
 */
import { describe, expect, it } from 'vitest';

import { INITIAL_EFFECT_STATE } from '../seasons/effectState.js';
import { onSeasonComplete } from './evolveScoring.js';
import type { MatchState } from './matchState.js';
import { royaleRuleset } from '../../test/builders.js';

function stateWith(effect: MatchState['ruleset']['seasonComplete']['effect']): MatchState {
  const ruleset = royaleRuleset();
  return {
    ruleset: { ...ruleset, seasonComplete: { ...ruleset.seasonComplete, effect } },
    players: { p: { effects: INITIAL_EFFECT_STATE, points: 0, shieldRankMargin: 1 } },
    currentRound: { roundIndex: 0 },
  } as unknown as MatchState;
}

const fired = { type: 'seasonCompleteFired', accountId: 'p', points: 300 } as const;

describe('a Season Complete with a shield effect', () => {
  it('arms the shield with its rank margin', () => {
    const after = onSeasonComplete(stateWith({ type: 'shield', charges: 1, rankMargin: 3 }), fired);
    expect(after.players['p']?.effects.shieldCharges).toBe(1);
    expect(after.players['p']?.shieldRankMargin).toBe(3);
  });

  it('keeps the margin without a shield', () => {
    const after = onSeasonComplete(stateWith({ type: 'none' }), fired);
    expect(after.players['p']?.shieldRankMargin).toBe(1);
  });
});
