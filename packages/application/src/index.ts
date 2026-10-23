/**
 * @file   packages/application/src/index.ts
 * @module application
 * @brief  Public entry point of @sbr/application.
 *
 * Responsibility: use cases (commands and queries) and the ports they depend on: the
 *                 live match engine and the ruleset mapping it shares with the Quick Test.
 * Depends on:     ./match/*
 * Used by:        apps/server
 * Spec:           docs/spec/02-software-architecture.md §3
 */

export { defaultRulesetFor, toMatchRuleset } from './match/rulesets.js';
export { chosenMissedNumbers, delayOf, drawRange, withinDrawRange } from './match/timing.js';
export { MatchEngine, MatchError } from './match/engine.js';
export { nextDrawAt, waitingForHost } from './match/flow.js';
export { minPlayersOf, tooFewAtStart } from './match/startRules.js';
export { MatchNotFound } from './match/runner.js';
export type { CreateMatchInput } from './match/create.js';
export type * from './match/ports.js';
