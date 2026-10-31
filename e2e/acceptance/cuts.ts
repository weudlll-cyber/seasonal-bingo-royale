/**
 * @file   e2e/acceptance/cuts.ts
 * @module e2e/acceptance
 * @brief  Cut decisions against server points, from the Quick Test response (01 §7).
 *
 * Responsibility: replay the server's events with the points the client shows (event
 *                 points plus the stage baselines for score carry) and check every cut:
 *                 no eliminated player has more points than a survivor the Winter shield
 *                 did not save. Equal points are decided by the tie-break of 01 §7.5 and
 *                 are counted, so the report can name them.
 * Depends on:     @playwright/test
 * Used by:        the acceptance Playwright specs (test helper)
 * Spec:           docs/spec/01-game-design.md §7.5, §8.2; docs/spec/12-testing-strategy.md §3 inv. 7
 */
import { expect } from '@playwright/test';

interface ServerEvent {
  readonly type: string;
  readonly accountId?: string;
  readonly markPoints?: number;
  readonly instantPoints?: number;
  readonly points?: number;
  readonly value?: number;
  readonly survivors?: readonly string[];
  readonly eliminated?: readonly string[];
  readonly shieldSaves?: readonly string[];
}

export interface ServerResult {
  readonly events: readonly ServerEvent[];
  readonly stagePoints: readonly {
    readonly step: number;
    readonly points: Readonly<Record<string, number>>;
  }[];
}

function eventPoints(e: ServerEvent): number {
  if (e.type === 'cellMarked') return e.markPoints ?? 0;
  if (e.type === 'seasonActivated') return e.instantPoints ?? 0;
  if (e.type === 'patternScored' || e.type === 'seasonCompleteFired') return e.points ?? 0;
  if (e.type === 'jackpotClaimed') return e.value ?? 0;
  return 0;
}

// Returns the number of cuts where an eliminated player tied a survivor on points.
export function checkCuts(result: ServerResult): { cuts: number; ties: number } {
  const points = new Map<string, number>();
  const baselines = new Map(result.stagePoints.map((s) => [s.step, s.points]));
  let cuts = 0;
  let ties = 0;
  result.events.forEach((e, i) => {
    if (e.accountId !== undefined) {
      points.set(e.accountId, (points.get(e.accountId) ?? 0) + eventPoints(e));
    }
    if (e.type === 'cutApplied') {
      cuts += 1;
      const saved = new Set(e.shieldSaves ?? []);
      const kept = (e.survivors ?? []).filter((id) => !saved.has(id));
      const lowestKept = Math.min(...kept.map((id) => points.get(id) ?? 0));
      const highestOut = Math.max(...(e.eliminated ?? []).map((id) => points.get(id) ?? 0));
      expect(
        highestOut,
        `cut ${String(cuts)}: eliminated ≤ unshielded survivors`,
      ).toBeLessThanOrEqual(lowestKept);
      if (highestOut === lowestKept) ties += 1;
    }
    for (const [id, value] of Object.entries(baselines.get(i + 1) ?? {})) points.set(id, value);
  });
  return { cuts, ties };
}
