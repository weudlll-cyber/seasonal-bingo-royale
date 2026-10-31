/**
 * @file   packages/domain/src/draw/drawSequence.ts
 * @module domain/draw
 * @brief  Deterministic draw sequence of one round (01 §5, §9).
 *
 * Responsibility: compute the full ordered permutation of the game-type-specific pool
 *                 that drives a round's draws. Fisher-Yates shuffle driven by the DRBG,
 *                 so same seed + same (match, round, purpose) → same order.
 * Depends on:     ./drbg, ./pool, ../gameType
 * Used by:        ../match/decide, ../verifyMatch, ../index
 * Spec:           docs/spec/01-game-design.md §5, §9
 */
import type { GameType } from '../gameType.js';
import { createDrbg } from './drbg.js';
import { poolItems } from './pool.js';

export interface DrawSequenceInput {
  readonly seed: Uint8Array;
  readonly matchId: string;
  readonly roundIndex: number;
  readonly gameType: GameType;
}

export function drawSequence(input: DrawSequenceInput): readonly number[] {
  const label = `sbr/draw/${input.matchId}/${String(input.roundIndex)}`;
  const drbg = createDrbg(input.seed, label);
  const items = [...poolItems(input.gameType)];
  // Fisher-Yates with the DRBG as randomness source: pure, deterministic.
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = drbg.nextInt(i + 1);
    const tmp = items[i];
    const other = items[j];
    // `noUncheckedIndexedAccess` makes TS mark the reads as possibly undefined; both
    // indexes are inside bounds by construction, so refuse to continue if they are not.
    if (tmp === undefined || other === undefined) throw new Error('shuffle index out of bounds');
    items[i] = other;
    items[j] = tmp;
  }
  return items;
}
