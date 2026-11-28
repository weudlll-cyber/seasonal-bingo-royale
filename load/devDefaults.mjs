/**
 * @file   load/devDefaults.mjs
 * @module load
 * @brief  The running development server as the demo league's default target.
 *
 * Responsibility: imported first by the demo league, which fills the development database on
 *                 purpose (the measurements use ./testDefaults.mjs, K125), so ./common.mjs finds the server (127.0.0.1:3900) and the client's origin
 *                 (localhost:5390) unless SBR_LOAD_BASE / SBR_LOAD_ORIGIN say otherwise. Kept
 *                 apart so the generator bundled into the production image (./loadcheck.mjs)
 *                 holds no development address.
 * Depends on:     nothing
 * Used by:        ../apps/server/demo-league.mjs
 * Spec:           docs/spec/01-game-design.md §10
 */
process.env.SBR_LOAD_BASE ??= 'http://127.0.0.1:3900';
process.env.SBR_LOAD_ORIGIN ??= 'http://localhost:5390';
