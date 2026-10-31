/**
 * @file   apps/server/test/playToEnd.ts
 * @module server/test
 * @brief  Plays a started match to its end straight through an engine (the scheduler's commands).
 *
 * Responsibility: draw and close each speed window by hand until the match has finished;
 *                 fail after 200 draws. Takes the engine, so a second app on the same
 *                 database (./harness buildOn) can play the match on.
 * Depends on:     @sbr/application (types)
 * Used by:        the integration tests in this folder (test helper)
 * Spec:           docs/spec/12-testing-strategy.md §2
 */
import type { MatchEngine } from '@sbr/application';

export async function playToEnd(engine: MatchEngine, id: string): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    const m = await engine.runner.current(id);
    if (m.record.status === 'finished') return;
    await engine.handle({ matchId: id, kind: 'draw', dueAt: Date.now() });
    const drawIndex = ((await engine.runner.current(id)).state.currentRound?.draws.length ?? 0) - 1;
    await engine.handle({ matchId: id, kind: 'close_speed_window', dueAt: Date.now(), drawIndex });
  }
  throw new Error('the match did not end');
}
