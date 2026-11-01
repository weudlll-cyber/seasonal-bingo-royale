/**
 * @file   apps/server/src/dev/devClock.ts
 * @module server/dev
 * @brief  Development only: a clock that single matches can be moved ahead on (time travel).
 *
 * Responsibility: `DevClock` is the engine's Clock in development builds: the real time, plus
 *                 for a match the time it was moved ahead. `travel` moves one match up to `ms`
 *                 ahead by running its scheduled actions in due order, each at its due time
 *                 (the match's clock is set to it first), so draws, window closes, round pauses
 *                 and quiet hours happen as they would over that time; then the match's clock
 *                 stays at the target. Other matches keep the real time. In memory: a restart
 *                 brings every match back to the real time. Never in a production bundle.
 * Depends on:     @sbr/application (types), ../match/pgScheduler (types)
 * Used by:        ../http/app, ../http/routes/timeTravel
 * Spec:           docs/spec/12-testing-strategy.md §4 (journey 2); docs/spec/15-implementation-plan.md WP-14
 */
import type { Clock, MatchEngine } from '@sbr/application';

import type { PgScheduler } from '../match/pgScheduler.js';

// More than a week of 15-minute draws with their window closes.
const MAX_ACTIONS = 5_000;

export class DevClock implements Clock {
  private readonly ahead = new Map<string, number>();

  now(matchId?: string): number {
    return Date.now() + (matchId === undefined ? 0 : (this.ahead.get(matchId) ?? 0));
  }

  // Moves one match's clock forward to `at`; never back.
  moveTo(matchId: string, at: number): void {
    const now = this.now(matchId);
    if (at > now) this.ahead.set(matchId, (this.ahead.get(matchId) ?? 0) + at - now);
  }
}

interface TravelDeps {
  readonly clock: DevClock;
  readonly scheduler: PgScheduler;
  readonly engine: MatchEngine;
}

// Moves the match `ms` ahead; resolves with the number of actions run and its new time.
export async function travel(
  deps: TravelDeps,
  matchId: string,
  ms: number,
): Promise<{ readonly actions: number; readonly now: number }> {
  const target = deps.clock.now(matchId) + ms;
  let actions = 0;
  while (actions < MAX_ACTIONS) {
    const ran = await deps.scheduler.runNextFor(matchId, target, async (action) => {
      deps.clock.moveTo(matchId, action.dueAt);
      await deps.engine.handle(action);
    });
    if (ran === null) break;
    actions += 1;
  }
  deps.clock.moveTo(matchId, target);
  return { actions, now: deps.clock.now(matchId) };
}
