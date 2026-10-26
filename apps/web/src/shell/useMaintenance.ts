/**
 * @file   apps/web/src/shell/useMaintenance.ts
 * @module web/shell
 * @brief  Whether the server is in maintenance (`sbr maintenance on`), and the reason given.
 *
 * Responsibility: ask GET /api/v1/maintenance when the client starts and every 30 seconds,
 *                 so the maintenance page and the host's banner appear and go without a
 *                 reload. Null until the first answer (and after a failed one): nothing is
 *                 blocked on a guess.
 * Depends on:     react, ./http
 * Used by:        ./AppShell
 * Spec:           docs/spec/09-deployment-architecture.md §4; docs/spec/01-game-design.md §13
 */
import { useEffect, useState } from 'react';

import { api } from './http.js';

export interface MaintenanceState {
  readonly on: boolean;
  readonly reason: string | null;
}

const EVERY_MS = 30_000;

export function useMaintenance(): MaintenanceState | null {
  const [state, setState] = useState<MaintenanceState | null>(null);
  useEffect(() => {
    let live = true;
    const ask = (): void => {
      api<MaintenanceState>('/maintenance').then(
        (next) => {
          if (live) setState(next);
        },
        () => {
          if (live) setState(null);
        },
      );
    };
    ask();
    const id = window.setInterval(ask, EVERY_MS);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, []);
  return state;
}
