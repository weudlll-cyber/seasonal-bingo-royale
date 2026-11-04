/**
 * @file   load/devDefaults.mjs
 * @module load
 * @brief  The local development stack as the load scripts' default target.
 *
 * Responsibility: imported first by the scripts that run against the development stack, so
 *                 ./common.mjs finds the server (127.0.0.1:3900) and the client's origin
 *                 (localhost:5390) unless SBR_LOAD_BASE / SBR_LOAD_ORIGIN say otherwise. Kept
 *                 apart so the generator bundled into the production image (./loadcheck.mjs)
 *                 holds no development address.
 * Depends on:     nothing
 * Used by:        ./drawLatency.mjs, ./spectatorStream.mjs, ./asyncJump.mjs,
 *                 ../apps/server/demo-league.mjs
 * Spec:           docs/spec/12-testing-strategy.md §5
 */
process.env.SBR_LOAD_BASE ??= 'http://127.0.0.1:3900';
process.env.SBR_LOAD_ORIGIN ??= 'http://localhost:5390';
