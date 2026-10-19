/**
 * @file   packages/domain/src/scoring/speedBonus.ts
 * @module domain/scoring
 * @brief  Speed-bonus computation for the manual marking window (01 §8.1).
 *
 * Responsibility: linear decay from `maxBonus` at delta 0 to 0 at delta = window.
 *                 Negative deltas and deltas past the window return 0; this matches
 *                 "a tap within speedWindowMs after the draw earns a speed bonus" (01 §6).
 * Depends on:     nothing
 * Used by:        future match engine
 * Spec:           docs/spec/01-game-design.md §6, §8.1
 */

export interface SpeedBonusCfg {
  readonly maxBonus: number;
  readonly windowMs: number;
}

export function speedBonus(cfg: SpeedBonusCfg, deltaMs: number): number {
  if (deltaMs < 0 || deltaMs > cfg.windowMs) return 0;
  if (cfg.windowMs <= 0) return 0;
  const factor = 1 - deltaMs / cfg.windowMs;
  return Math.round(cfg.maxBonus * factor);
}
