/**
 * @file   packages/domain/src/royale/cut.ts
 * @module domain/royale
 * @brief  Apply the end-of-stage cut with Winter-shield rescue (01 §7.4).
 *
 * Responsibility: rank the active field with the tie-break chain of 01 §8.4, drop the
 *                 lowest according to the cut rule, then rescue players whose shield
 *                 charges + rank margin cover them. Never falls below `minSurvivors`
 *                 (invariant 7 of 12 §3). Rescues only add; no one ranked above a
 *                 survivor can be removed except by the cut rule itself.
 * Depends on:     ./finalRanking (for the shared comparator shape)
 * Used by:        apps/server match orchestration, WP-08
 * Spec:           docs/spec/01-game-design.md §7.4, docs/spec/12-testing-strategy.md §3 inv. 7
 */

export interface Candidate {
  readonly accountId: string;
  readonly points: number;
  readonly patterns: number;
  readonly seasonsActivated: number;
  readonly lastScoringDraw: number | null;
  readonly joinedAt: number;
  readonly shieldCharges: number;
  readonly shieldRankMargin: number;
}

export type CutRule =
  | { readonly keep: 'percent'; readonly value: number; readonly minSurvivors: number }
  | { readonly keep: 'count'; readonly value: number; readonly minSurvivors: number }
  | { readonly keep: 'scoreThreshold'; readonly value: number; readonly minSurvivors: number };

export interface CutResult {
  readonly survivors: readonly string[]; // account ids, ranked order
  readonly eliminated: readonly string[]; // account ids, ranked order (worst first)
  readonly shieldSaves: readonly string[]; // account ids saved by a shield
}

export function applyCut(active: readonly Candidate[], rule: CutRule): CutResult {
  const ranked = [...active].sort(compare);
  const baseKeep = resolveKeep(rule, ranked);
  const survivorIds = new Set(ranked.slice(0, baseKeep).map((p) => p.accountId));
  const shieldSaves: string[] = [];
  // Walk the eliminated slice from best-ranked to worst; a shield can only rescue if
  // the player is within `shieldRankMargin` places of the cut line (01 §8.2). The cut
  // line sits between index baseKeep - 1 and baseKeep, so a player at index i is
  // `i - baseKeep + 1` places below the line.
  for (let i = baseKeep; i < ranked.length; i += 1) {
    const player = ranked[i];
    if (player === undefined) continue;
    const placesBelow = i - baseKeep + 1;
    if (player.shieldCharges > 0 && placesBelow <= player.shieldRankMargin) {
      survivorIds.add(player.accountId);
      shieldSaves.push(player.accountId);
    }
  }
  const survivors = ranked.filter((p) => survivorIds.has(p.accountId)).map((p) => p.accountId);
  const eliminated = ranked.filter((p) => !survivorIds.has(p.accountId)).map((p) => p.accountId);
  return { survivors, eliminated, shieldSaves };
}

function resolveKeep(rule: CutRule, ranked: readonly Candidate[]): number {
  const totalCount = ranked.length;
  let computed: number;
  if (rule.keep === 'percent') computed = Math.round((rule.value / 100) * totalCount);
  else if (rule.keep === 'count') computed = Math.min(rule.value, totalCount);
  else computed = ranked.filter((p) => p.points >= rule.value).length;
  return Math.max(rule.minSurvivors, Math.min(computed, totalCount));
}

function compare(a: Candidate, b: Candidate): number {
  if (a.points !== b.points) return b.points - a.points;
  if (a.patterns !== b.patterns) return b.patterns - a.patterns;
  if (a.seasonsActivated !== b.seasonsActivated) return b.seasonsActivated - a.seasonsActivated;
  const dA = a.lastScoringDraw ?? Number.POSITIVE_INFINITY;
  const dB = b.lastScoringDraw ?? Number.POSITIVE_INFINITY;
  if (dA !== dB) return dA - dB;
  return a.joinedAt - b.joinedAt;
}
