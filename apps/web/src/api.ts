/**
 * @file   apps/web/src/api.ts
 * @module web
 * @brief  Thin fetch wrapper for the dev-only Quick Test endpoint (WP-08).
 *
 * Responsibility: wrap `POST /dev/quicktest` on the server, relative to where the client is
 *                 served (the Vite dev server proxies /dev to the server, like /api).
 * Depends on:     ./types, ./shell/http (BASE_PATH)
 * Used by:        ./App, ./components/StartForm
 * Spec:           docs/spec/15-implementation-plan.md WP-08
 */
import { BASE_PATH } from './shell/http.js';
import type { GameType, MarkingMode, MissedNumbers, QuickTestResult } from './types.js';

export interface StartQuickTestInput {
  readonly gameType: GameType;
  readonly playerCount: number;
  readonly ownerCards: number;
  readonly tickedPrizes: readonly string[];
  readonly seedText: string;
  readonly markingMode: MarkingMode;
  readonly missedNumbers: MissedNumbers;
  // Timed draws: the chosen gap, so the server measures the missed-number delay in the
  // same draws the client plays back (01 §6). Left out for host draws.
  readonly drawIntervalMs?: number;
}

export async function startQuickTest(input: StartQuickTestInput): Promise<QuickTestResult> {
  const response = await fetch(`${BASE_PATH}dev/quicktest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => ({}));
    throw new Error(`Quick Test failed: ${response.status.toString()} ${JSON.stringify(body)}`);
  }
  return (await response.json()) as QuickTestResult;
}
