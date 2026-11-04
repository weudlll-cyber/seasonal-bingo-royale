/**
 * @file   packages/application/src/match/rulesets.ts
 * @module application/match
 * @brief  From a published ruleset document (contracts) to the engine's MatchRuleset (domain).
 *
 * Responsibility: pick the default ruleset of a game type and mode, and map a contracts
 *                 `Ruleset` plus the starter's marking and missed-number choices onto the
 *                 trimmed `MatchRuleset` the domain lifecycle runs on. Classic rulesets
 *                 have no stages; the domain gets a single placeholder stage. Shared by the
 *                 live match engine and the dev Quick Test.
 * Depends on:     @sbr/contracts, @sbr/domain (types)
 * Used by:        apps/server/src/dev/quicktest.ts, ../index, ./create
 * Spec:           docs/spec/01-game-design.md §3a, §6; docs/spec/02-software-architecture.md §6
 */
import {
  BUILTIN_PRIZE_POINTS,
  classicRealtimeDefault,
  classicSeasonsRealtimeDefault,
  royaleAsyncDefault,
  royaleRealtimeDefault,
  type Ruleset,
} from '@sbr/contracts';
import type { GameType, MarkingMode, MatchMode, MatchRuleset, MissedNumbers } from '@sbr/domain';

// Only the royale has an asynchronous default ruleset (01 §11); ./create refuses an
// asynchronous classic match.
export function defaultRulesetFor(gameType: GameType, mode: MatchMode = 'realtime'): Ruleset {
  if (gameType === 'royale') return mode === 'async' ? royaleAsyncDefault : royaleRealtimeDefault;
  if (gameType === 'classicSeasons') return classicSeasonsRealtimeDefault;
  return classicRealtimeDefault;
}

export function toMatchRuleset(
  ruleset: Ruleset,
  markingMode: MarkingMode,
  missedNumbers: MissedNumbers,
): MatchRuleset {
  return {
    mode: ruleset.mode === 'async' ? 'async' : 'realtime',
    markingMode,
    missedNumbers,
    cardsPerPlayer: ruleset.general.cardsPerPlayer,
    freeCenter: ruleset.general.freeCenter,
    pointsPerMark: ruleset.scoring.pointsPerMark,
    firstToPatternBonusPercent: ruleset.scoring.firstToPatternBonusPercent,
    pointsByPrizeKey: BUILTIN_PRIZE_POINTS,
    seasons: ruleset.seasons,
    seasonComplete: ruleset.seasonComplete ?? { points: 0, effect: { type: 'none' } },
    jackpot: ruleset.jackpot ?? { base: 0, growthPerRound: 0 },
    stages: stagesOf(ruleset),
  };
}

function stagesOf(ruleset: Ruleset): MatchRuleset['stages'] {
  if (ruleset.stages === undefined) return CLASSIC_PLACEHOLDER_STAGES;
  return ruleset.stages.map((s) => {
    const base = {
      kind: s.kind,
      rounds: s.rounds,
      roundEnd: s.roundEnd,
      scoreCarry: s.scoreCarry,
      stageMultiplier: s.stageMultiplier,
      activePatterns: [...s.activePatterns],
    };
    const timing = s.cutTiming === undefined ? {} : { cutTiming: s.cutTiming };
    return s.cut === undefined ? base : { ...base, cut: s.cut, ...timing };
  });
}

// Classic types play one round without stages (01 §3a); the domain still wants one entry.
const CLASSIC_PLACEHOLDER_STAGES: MatchRuleset['stages'] = [
  {
    kind: 'final',
    rounds: 1,
    roundEnd: { kind: 'firstFullHouse' },
    scoreCarry: { kind: 'reset' },
    stageMultiplier: 1,
    activePatterns: [],
  },
];
