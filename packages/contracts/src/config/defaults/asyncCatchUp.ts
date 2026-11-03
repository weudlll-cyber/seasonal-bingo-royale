/**
 * @file   packages/contracts/src/config/defaults/asyncCatchUp.ts
 * @module contracts/config/defaults
 * @brief  Catch-up of an asynchronous match after downtime: pace and cap (06 §6).
 *
 * Responsibility: when the server was down past due draws of an asynchronous match, the
 *                 missed draws are made in order, one every `intervalMs` (never before the
 *                 previous draw's speed window has closed, D10), at most `maxDraws` of them;
 *                 older missed draws are dropped and the normal cadence resumes. A server
 *                 setting, not part of a ruleset.
 * Depends on:     nothing
 * Used by:        ../../index
 * Spec:           docs/spec/06-realtime-architecture.md §6
 */

export const ASYNC_CATCH_UP = Object.freeze({ intervalMs: 2_000, maxDraws: 75 });
