/**
 * @file   load/testDefaults.mjs
 * @module load
 * @brief  The test server as the load measurements' default target (kit K125).
 *
 * Responsibility: imported first by the measurements, so ./common.mjs finds the test server
 *                 (`pnpm test-server`: 127.0.0.1:3901, public address 127.0.0.1:5392, a database
 *                 of its own, thrown away) unless SBR_LOAD_BASE / SBR_LOAD_ORIGIN say otherwise.
 *                 A measurement never writes the development database. Kept apart so the
 *                 generator bundled into the production image (./loadcheck.mjs) holds no local
 *                 address.
 * Depends on:     nothing
 * Used by:        ./drawLatency.mjs, ./spectatorStream.mjs, ./asyncJump.mjs
 * Spec:           docs/spec/12-testing-strategy.md §5
 */
process.env.SBR_LOAD_BASE ??= 'http://127.0.0.1:3901';
process.env.SBR_LOAD_ORIGIN ??= 'http://127.0.0.1:5392';
