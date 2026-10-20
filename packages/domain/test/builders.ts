/**
 * @file   packages/domain/test/builders.ts
 * @module domain/test
 * @brief  Shared test builders for match rulesets and seeds (12 §7).
 *
 * Responsibility: produce the trimmed MatchRuleset values the lifecycle expects,
 *                 so each test file doesn't duplicate the ~50-line object. Mirrors
 *                 the four defaults in contracts/config/defaults, but keeps the
 *                 domain layer free of a cross-layer import.
 * Depends on:     @sbr/domain (types only)
 * Used by:        packages/domain/src/match/match.test.ts and sibling tests
 * Spec:           docs/spec/12-testing-strategy.md §7
 */
import {
  BUILTIN_PRIZE_CATALOGUE_ORDER,
  SEED_BYTES,
  type MatchRuleset,
  type StagePlanEntry,
} from '../src/index.js';

export const BUILTIN_PRIZE_POINTS: Readonly<Record<string, number>> = Object.freeze({
  'rows-1': 100,
  'columns-1': 100,
  'rows-2': 200,
  'columns-2': 200,
  'rows-3': 300,
  'columns-3': 300,
  'rows-4': 400,
  'columns-4': 400,
  'rows-5': 500,
  'columns-5': 500,
  fourCorners: 100,
  oneDiagonal: 150,
  bothDiagonals: 300,
  fullCard: 500,
});

export function seed(byte: number): Uint8Array {
  return new Uint8Array(SEED_BYTES).fill(byte);
}

const DEFAULT_SEASONS = Object.freeze({
  spring: { effect: { type: 'growth', pointsPerMark: 2, durationDraws: 10 } as const },
  summer: { effect: { type: 'multiplier', factor: 1.5, durationDraws: 8 } as const },
  autumn: { effect: { type: 'harvest', scope: 'row', pointsPerMarked: 15 } as const },
  winter: { effect: { type: 'shield', rankMargin: 3, charges: 1 } as const },
});

const ROYALE_STAGES: readonly StagePlanEntry[] = [
  {
    kind: 'qualification',
    rounds: 2,
    roundEnd: { kind: 'drawCount', draws: 40 },
    cut: { keep: 'percent', value: 50, minSurvivors: 2 },
    scoreCarry: { kind: 'keep' },
    stageMultiplier: 1,
    activePatterns: ['rows-1', 'columns-1', 'oneDiagonal', 'fourCorners'],
  },
  {
    kind: 'elimination',
    rounds: 2,
    roundEnd: { kind: 'drawCount', draws: 35 },
    cut: { keep: 'percent', value: 50, minSurvivors: 2 },
    scoreCarry: { kind: 'keep' },
    stageMultiplier: 1.25,
    activePatterns: ['rows-1', 'columns-1', 'oneDiagonal', 'bothDiagonals', 'fourCorners'],
  },
  {
    kind: 'final',
    rounds: 1,
    roundEnd: { kind: 'firstFullHouse' },
    scoreCarry: { kind: 'reset' },
    stageMultiplier: 2,
    activePatterns: ['fullCard'],
  },
];

export function royaleRuleset(): MatchRuleset {
  return {
    mode: 'realtime',
    markingMode: 'auto',
    cardsPerPlayer: 1,
    freeCenter: true,
    pointsPerMark: 10,
    firstToPatternBonusPercent: 50,
    pointsByPrizeKey: BUILTIN_PRIZE_POINTS,
    seasons: DEFAULT_SEASONS,
    seasonComplete: { points: 300, effect: { type: 'none' } },
    jackpot: { base: 1_000, growthPerRound: 250 },
    stages: ROYALE_STAGES,
  };
}

// Classic rulesets ignore ruleset.stages (stagePlan is a single pseudo-stage); still
// supply a valid single-stage array to satisfy MatchRuleset's shape.
const CLASSIC_PLACEHOLDER_STAGES: readonly StagePlanEntry[] = [
  {
    kind: 'final',
    rounds: 1,
    roundEnd: { kind: 'firstFullHouse' },
    scoreCarry: { kind: 'reset' },
    stageMultiplier: 1,
    activePatterns: [],
  },
];

export function classicRuleset(): MatchRuleset {
  return {
    mode: 'realtime',
    markingMode: 'auto',
    cardsPerPlayer: 1,
    freeCenter: true,
    pointsPerMark: 10,
    firstToPatternBonusPercent: 50,
    pointsByPrizeKey: BUILTIN_PRIZE_POINTS,
    seasons: DEFAULT_SEASONS,
    seasonComplete: { points: 300, effect: { type: 'none' } },
    jackpot: { base: 0, growthPerRound: 0 },
    stages: CLASSIC_PLACEHOLDER_STAGES,
  };
}

export const BUILTIN_CATALOGUE = BUILTIN_PRIZE_CATALOGUE_ORDER;
