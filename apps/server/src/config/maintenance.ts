/**
 * @file   apps/server/src/config/maintenance.ts
 * @module server/config
 * @brief  The maintenance flag: a file in the data directory the operator sets with `sbr maintenance on`.
 *
 * Responsibility: while <SBR_DATA_DIR>/maintenance exists, no new match is created or
 *                 started, also not automatically (the engine holds the start, D22);
 *                 running matches go on to their end (09 §4). The file's text, if
 *                 any, is the reason shown to players (at most 200 characters). The file is
 *                 checked at most every 2 seconds, so the flag needs no restart.
 * Depends on:     node:fs, node:path
 * Used by:        ../http/routes/matches, ../http/routes/maintenance, ../http/app
 * Spec:           docs/spec/09-deployment-architecture.md §4
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface Maintenance {
  // What the operator wrote with `sbr maintenance on "<reason>"`; null without one.
  readonly reason: string | null;
}

// Null while maintenance is off.
export type MaintenanceCheck = () => Maintenance | null;

const MAX_REASON = 200;

export function maintenanceFlag(dataDir: string, now: () => number = Date.now): MaintenanceCheck {
  const file = path.join(dataDir, 'maintenance');
  let checkedAt = -Infinity;
  let state: Maintenance | null = null;
  return () => {
    if (now() - checkedAt >= 2_000) {
      state = read(file);
      checkedAt = now();
    }
    return state;
  };
}

function read(file: string): Maintenance | null {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const reason = text.trim().slice(0, MAX_REASON);
  return { reason: reason === '' ? null : reason };
}
