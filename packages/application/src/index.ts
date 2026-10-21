/**
 * @file   packages/application/src/index.ts
 * @module application
 * @brief  Public entry point of @sbr/application.
 *
 * Responsibility: use cases (commands and queries) and the ports they depend on: the
 *                 live match engine and the ruleset mapping it shares with the Quick Test.
 * Depends on:     ./match/*
 * Used by:        src/index.test.ts
 * Spec:           docs/spec/02-software-architecture.md §3
 */

// Package identity, so the shell is importable and the test runner has something to check.
export const PACKAGE_NAME = '@sbr/application';
export { defaultRulesetFor, toMatchRuleset } from './match/rulesets.js';
export { chosenMissedNumbers, delayOf, drawRange, withinDrawRange } from './match/timing.js';
export { MatchEngine, MatchError, type EngineDeps } from './match/engine.js';
export { MatchNotFound } from './match/runner.js';
export type { CreateMatchInput } from './match/create.js';
export type * from './match/ports.js';
