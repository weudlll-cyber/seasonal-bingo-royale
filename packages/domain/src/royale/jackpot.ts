/**
 * @file   packages/domain/src/royale/jackpot.ts
 * @module domain/royale
 * @brief  Seasonal jackpot value (01 §8.5).
 *
 * Responsibility: pure arithmetic for the points-only jackpot. `jackpotValue` is base
 *                 plus growthPerRound times the number of rounds in which nobody has
 *                 claimed it yet (invariant 10 of 12 §3).
 * Depends on:     nothing
 * Used by:        ../index
 * Spec:           docs/spec/01-game-design.md §8.5, docs/spec/12-testing-strategy.md §3 inv. 10
 */

export interface JackpotCfg {
  readonly base: number;
  readonly growthPerRound: number;
}

export function jackpotValue(cfg: JackpotCfg, unclaimedRounds: number): number {
  if (unclaimedRounds < 0) throw new Error('unclaimedRounds must be non-negative');
  return cfg.base + cfg.growthPerRound * unclaimedRounds;
}
