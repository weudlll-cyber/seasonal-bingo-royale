/**
 * @file   packages/domain/src/scoring/speedBonus.ts
 * @module domain/scoring
 * @brief  Speed-bonus computation for the manual marking window (01 §8.1).
 *
 * Responsibility: linear decay from `maxBonus` at delta 0 to 0 at delta = window.
 *                 Negative deltas and deltas past the window return 0; this matches
 *                 "a tap within speedWindowMs after the draw earns a speed bonus" (01 §6).
 *                 The same bonus as steps over whole milliseconds, for a screen that
 *                 shows it without computing it (the Quick Test, audit-3 H6).
 * Depends on:     nothing
 * Used by:        @sbr/application (taps), apps/server (client view), ../index
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

// The bonus a tap `untilMs` or less after the draw earns (after the previous step).
export interface SpeedBonusStep {
  readonly untilMs: number;
  readonly bonus: number;
}

// speedBonus over whole milliseconds 0..window, one step per run of equal bonuses; past
// the last step the bonus is 0.
export function speedBonusSteps(cfg: SpeedBonusCfg): readonly SpeedBonusStep[] {
  const steps: SpeedBonusStep[] = [];
  for (let ms = 0; ms <= cfg.windowMs; ms += 1) {
    const bonus = speedBonus(cfg, ms);
    const last = steps[steps.length - 1];
    if (last !== undefined && last.bonus === bonus)
      steps[steps.length - 1] = { untilMs: ms, bonus };
    else steps.push({ untilMs: ms, bonus });
  }
  return steps;
}
