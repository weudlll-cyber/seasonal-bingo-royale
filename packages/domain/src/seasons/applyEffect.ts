/**
 * @file   packages/domain/src/seasons/applyEffect.ts
 * @module domain/seasons
 * @brief  Apply one effect activation to a player's EffectState (01 §8.2).
 *
 * Responsibility: compute the new state after a season cell was just marked and the
 *                 configured effect fires. Returns both the new state and the number
 *                 of instant points to credit (addPoints, harvest). Non-stacking: a
 *                 second multiplier/growth replaces the first and refreshes the
 *                 duration. revealNext bumps a ticket counter the UI will consume.
 * Depends on:     ./effectCatalog, ./effectState
 * Used by:        future match engine, ../index, ../match/evolveScoring, ../match/markResolver
 * Spec:           docs/spec/01-game-design.md §8.2
 */
import type { Effect } from './effectCatalog.js';
import type { EffectState } from './effectState.js';

export interface ApplyEffectResult {
  readonly state: EffectState;
  // Points to add to the player's total right now (addPoints and the computed harvest
  // amount). Does not include the base mark that triggered the season cell.
  readonly instantPoints: number;
}

export interface HarvestContext {
  // The caller tallies the number of already-marked cells in the harvest scope and
  // passes it in; applyEffect does not know what the card looks like.
  readonly markedCellsInScope: number;
}

export function applyEffect(
  state: EffectState,
  effect: Effect,
  harvest?: HarvestContext,
): ApplyEffectResult {
  switch (effect.type) {
    case 'none':
      return { state, instantPoints: 0 };
    case 'addPoints':
      return { state, instantPoints: effect.points };
    case 'multiplier':
      return {
        state: {
          ...state,
          multiplier: { factor: effect.factor, remainingDraws: effect.durationDraws },
        },
        instantPoints: 0,
      };
    case 'growth':
      return {
        state: {
          ...state,
          growth: {
            pointsPerMark: effect.pointsPerMark,
            remainingDraws: effect.durationDraws,
            nthMark: 0,
          },
        },
        instantPoints: 0,
      };
    case 'harvest':
      return { state, instantPoints: (harvest?.markedCellsInScope ?? 0) * effect.pointsPerMarked };
    case 'shield':
      return {
        state: { ...state, shieldCharges: state.shieldCharges + effect.charges },
        instantPoints: 0,
      };
    case 'revealNext':
      return {
        state: { ...state, revealTickets: state.revealTickets + effect.count },
        instantPoints: 0,
      };
  }
}
