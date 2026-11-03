/**
 * @file   packages/application/src/index.ts
 * @module application
 * @brief  Public entry point of @sbr/application.
 *
 * Responsibility: use cases (commands and queries) and the ports they depend on: the
 *                 live match engine and the ruleset mapping it shares with the Quick Test;
 *                 the quiet hours and the "While you were away" summary of async matches;
 *                 the league-points rules, the season period and the ranks of the leaderboards.
 * Depends on:     ./match/*, ./leaderboard/*
 * Used by:        apps/server
 * Spec:           docs/spec/02-software-architecture.md §3
 */

export { defaultRulesetFor, toMatchRuleset } from './match/rulesets.js';
export { chosenMissedNumbers, delayOf, drawRange, withinDrawRange } from './match/timing.js';
export { MatchEngine, MatchError, type ClockFacts } from './match/engine.js';
export { quietUntil } from './match/asyncCadence.js';
export { buildAwaySummary } from './match/awaySummary.js';
export { isTimeZone } from './match/quietHours.js';
export { nextDrawAt, waitingForHost } from './match/flow.js';
export { minPlayersOf, tooFewAtStart } from './match/startRules.js';
export { MatchNotFound } from './match/runner.js';
export type { CreateMatchInput } from './match/create.js';
export type * from './match/ports.js';
export { leagueAwards, type LeagueEntryInput } from './leaderboard/leaguePoints.js';
export { seasonPeriodOf } from './leaderboard/seasonPeriod.js';
export { boardRanks } from './leaderboard/boardRanks.js';
