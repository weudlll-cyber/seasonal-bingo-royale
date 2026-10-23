/**
 * @file   apps/server/src/config/maintenance.ts
 * @module server/config
 * @brief  The maintenance flag: a file in the data directory the operator sets with `sbr maintenance on`.
 *
 * Responsibility: while <SBR_DATA_DIR>/maintenance exists, no new match is created or
 *                 started; running matches go on to their end (09 §4). The file is checked
 *                 at most every 2 seconds, so the flag needs no restart.
 * Depends on:     node:fs, node:path
 * Used by:        ../http/routes/matches, ../http/app
 * Spec:           docs/spec/09-deployment-architecture.md §4
 */
import { existsSync } from 'node:fs';
import path from 'node:path';

export type MaintenanceCheck = () => boolean;

export function maintenanceFlag(dataDir: string, now: () => number = Date.now): MaintenanceCheck {
  const file = path.join(dataDir, 'maintenance');
  let checkedAt = -Infinity;
  let on = false;
  return () => {
    if (now() - checkedAt >= 2_000) {
      on = existsSync(file);
      checkedAt = now();
    }
    return on;
  };
}
