/**
 * @file   apps/web/src/api.ts
 * @module web
 * @brief  Thin fetch wrapper for the dev-only Quick Test endpoint (WP-08).
 *
 * Responsibility: wrap `POST /dev/quicktest` on the server. The URL points at the
 *                 server dev port 3900; the server's dev CORS hook accepts the client
 *                 origin.
 * Depends on:     ./types
 * Used by:        ./App
 * Spec:           docs/spec/15-implementation-plan.md WP-08
 */
import type { GameType, QuickTestResult } from './types.js';

const SERVER_URL = 'http://127.0.0.1:3900/dev/quicktest';

export interface StartQuickTestInput {
  readonly gameType: GameType;
  readonly playerCount: number;
  readonly tickedPrizes: readonly string[];
  readonly seedText: string;
}

export async function startQuickTest(input: StartQuickTestInput): Promise<QuickTestResult> {
  const response = await fetch(SERVER_URL, {
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
