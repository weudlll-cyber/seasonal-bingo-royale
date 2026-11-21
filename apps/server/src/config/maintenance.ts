/**
 * @file   apps/server/src/config/maintenance.ts
 * @module server/config
 * @brief  The maintenance flag: a file in the data directory, set with `sbr maintenance on` or from the admin area.
 *
 * Responsibility: while <SBR_DATA_DIR>/maintenance exists, no new match is created or
 *                 started, also not automatically (the engine holds the start, D22);
 *                 running matches go on to their end (09 §4). The file's text, if
 *                 any, is the reason shown to players (at most 200 characters). The file is
 *                 checked at most every 2 seconds, so the flag needs no restart; the admin
 *                 area's switch (`setMaintenance`) writes or removes it and is seen at once.
 * Depends on:     nothing
 * Used by:        ../http/routes/matches, ../http/routes/maintenance, ../http/routes/admin,
 *                 ../http/app
 * Spec:           docs/spec/09-deployment-architecture.md §4
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface Maintenance {
  // What the operator wrote with `sbr maintenance on "<reason>"`; null without one.
  readonly reason: string | null;
}

// Null while maintenance is off.
export type MaintenanceCheck = () => Maintenance | null;

const MAX_REASON = 200;

// The checks of each flag file, so a switch from the admin area is seen at once.
const forgets = new Map<string, () => void>();

export function maintenanceFlag(dataDir: string, now: () => number = Date.now): MaintenanceCheck {
  const file = path.join(dataDir, 'maintenance');
  let checkedAt = -Infinity;
  let state: Maintenance | null = null;
  forgets.set(file, () => {
    checkedAt = -Infinity;
  });
  return () => {
    if (now() - checkedAt >= 2_000) {
      state = read(file);
      checkedAt = now();
    }
    return state;
  };
}

// The admin area's switch (admin-area §4): writes the flag file with the reason (an empty
// file without one), or removes it with null; the check reads it again at once.
export function setMaintenance(dataDir: string, reason: string | null): void {
  const file = path.join(dataDir, 'maintenance');
  if (reason === null) rmSync(file, { force: true });
  else writeFileSync(file, reason.slice(0, MAX_REASON));
  forgets.get(file)?.();
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
