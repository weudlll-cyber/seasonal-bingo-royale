/**
 * @file   packages/contracts/src/config/defaults/common.ts
 * @module contracts/config/defaults
 * @brief  Shared default values that every shipped ruleset starts from.
 *
 * Responsibility: the pieces of a ruleset that have one correct answer across every
 *                 default (01 §4–§8): base scoring, season effects, cards per player
 *                 and the lobby window shape. Mode-specific files pick their draw
 *                 interval and marking mode on top of this base.
 * Depends on:     ../ruleset
 * Used by:        ./royaleRealtime.ts, ./royaleAsync.ts, ./classicSeasonsRealtime.ts,
 *                 ./classicRealtime.ts
 * Spec:           docs/spec/01-game-design.md §4–§8, docs/spec/04-database-design.md §6
 */
import type { Effect } from '../ruleset.js';

export const DEFAULT_SCORING = Object.freeze({
  pointsPerMark: 10,
  maxSpeedBonus: 10,
  firstToPatternBonusPercent: 50,
});

export const DEFAULT_SEASONS = Object.freeze({
  spring: {
    effect: { type: 'growth', pointsPerMark: 2, durationDraws: 10 } satisfies Effect,
    announce: true,
  },
  summer: {
    effect: { type: 'multiplier', factor: 1.5, durationDraws: 8 } satisfies Effect,
    announce: true,
  },
  autumn: {
    effect: { type: 'harvest', scope: 'row', pointsPerMarked: 15 } satisfies Effect,
    announce: true,
  },
  winter: {
    effect: { type: 'shield', rankMargin: 3, charges: 1 } satisfies Effect,
    announce: true,
  },
});

export const DEFAULT_GENERAL = Object.freeze({
  cardsPerPlayer: 1,
  freeCenter: true,
});

export const DEFAULT_LOBBY_SHAPE = Object.freeze({
  minPlayers: 2,
  maxPlayers: 200,
  startRule: 'either' as const,
  lateJoin: true,
});
