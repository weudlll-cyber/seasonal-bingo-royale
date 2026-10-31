/**
 * @file   e2e/acceptance/serverView.ts
 * @module e2e/acceptance
 * @brief  What the server says about a live match: its draws per round and a player's points.
 *
 * Responsibility: read GET /api/v1/matches/:code/state as the page's own account and give
 *                 the draws of every round in order (from the event log) and the viewer's
 *                 points with the event number they belong to, so the play-through compares
 *                 each screen with the server instead of with another screen or a clock.
 * Depends on:     @playwright/test
 * Used by:        ./recap
 * Spec:           docs/spec/12-testing-strategy.md §4, §8; docs/spec/05-api-design.md §2.3a
 */
import type { Page } from '@playwright/test';

interface StateResponse {
  readonly seq: number;
  readonly me: string | null;
  readonly view: {
    readonly events: readonly { readonly type: string; readonly item?: number }[];
    readonly players?: readonly { readonly accountId: string; readonly points: number }[];
  };
}

export interface ServerView {
  readonly seq: number;
  // Every round's draws, oldest first.
  readonly rounds: readonly (readonly number[])[];
  // The viewer's points; null when the answer left out the player list.
  readonly points: number | null;
}

export async function serverView(page: Page, code: string): Promise<ServerView> {
  const body = (await (
    await page.request.get(`/api/v1/matches/${code}/state`)
  ).json()) as StateResponse;
  const rounds: number[][] = [];
  for (const e of body.view.events) {
    if (e.type === 'roundStarted') rounds.push([]);
    else if (e.type === 'drawMade' && e.item !== undefined) rounds.at(-1)?.push(e.item);
  }
  const own = body.view.players?.find((p) => p.accountId === body.me);
  return { seq: body.seq, rounds, points: own?.points ?? null };
}

// A screen's draws are the start of the server's current round, or of the one before when
// a new round began after the screen was read.
export function matchesServer(ticker: readonly number[], view: ServerView): boolean {
  const candidates = view.rounds.slice(-2);
  return candidates.some(
    (round) => ticker.length <= round.length && ticker.every((item, i) => round[i] === item),
  );
}
