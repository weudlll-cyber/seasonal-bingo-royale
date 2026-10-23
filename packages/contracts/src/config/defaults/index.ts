/**
 * @file   packages/contracts/src/config/defaults/index.ts
 * @module contracts/config/defaults
 * @brief  Barrel exposing the four published default rulesets.
 *
 * Responsibility: aggregate the four defaults the install script seeds (04 §6) under
 *                 one list so the server-side seed can loop over them. Each entry
 *                 carries the admin-visible name of 04 §3.2.
 * Depends on:     ../ruleset and the four files below., ./classicRealtime,
 *                 ./classicSeasonsRealtime, ./royaleAsync, ./royaleRealtime
 * Used by:        apps/server seed, admin "clone from default" entry point., ../../index
 * Spec:           docs/spec/04-database-design.md §6, docs/spec/11-admin-panel.md §3.3
 */
import type { Ruleset } from '../ruleset.js';
import { classicRealtimeDefault } from './classicRealtime.js';
import { classicSeasonsRealtimeDefault } from './classicSeasonsRealtime.js';
import { royaleAsyncDefault } from './royaleAsync.js';
import { royaleRealtimeDefault } from './royaleRealtime.js';

interface NamedRuleset {
  readonly name: string;
  readonly ruleset: Ruleset;
}

export const DEFAULT_RULESETS: readonly NamedRuleset[] = Object.freeze([
  { name: 'royale-realtime', ruleset: royaleRealtimeDefault },
  { name: 'royale-async', ruleset: royaleAsyncDefault },
  { name: 'classic-seasons-realtime', ruleset: classicSeasonsRealtimeDefault },
  { name: 'classic-realtime', ruleset: classicRealtimeDefault },
]);

export {
  classicRealtimeDefault,
  classicSeasonsRealtimeDefault,
  royaleAsyncDefault,
  royaleRealtimeDefault,
};
