/**
 * @file   apps/server/test/firstRound.ts
 * @module server/test
 * @brief  Plays the first round of a host-draw match to its end, a player tapping along.
 *
 * Responsibility: draw by draw through the engine: after every draw the player taps their
 *                 own new number over the HTTP fallback (if it is on their first card), then
 *                 the draw's speed window closes; stops when the round has ended (and its cut
 *                 is applied). Answers how many taps the player made.
 * Depends on:     ./harness (types), ./session (types)
 * Used by:        ./roundRecap.integration.test, ./pauseEnd.integration.test
 * Spec:           docs/spec/12-testing-strategy.md §4
 */
import type { Harness } from './harness.js';
import type { Client } from './session.js';

interface RoundPlayer {
  readonly harness: Harness;
  readonly id: string;
  readonly code: string;
  readonly player: Client;
  // The player's account id.
  readonly me: string;
}

// The player taps the number just drawn, if it is on their card; true when it marked.
async function tapNewest(p: RoundPlayer): Promise<boolean> {
  const now = (await p.harness.built.match.engine.runner.current(p.id)).state.currentRound;
  const item = now?.draws.at(-1);
  const cell =
    now?.cards[p.me]?.[0]?.card.cells.findIndex((c) => c.kind === 'number' && c.value === item) ??
    -1;
  if (cell < 0) return false;
  const r = await p.player.post(`/api/v1/matches/${p.code}/marks`, { cardIndex: 0, cell });
  return r.statusCode < 300;
}

export async function playFirstRound(p: RoundPlayer): Promise<number> {
  const engine = p.harness.built.match.engine;
  let taps = 0;
  for (let i = 0; i < 40; i += 1) {
    const round = (await engine.runner.current(p.id)).state.currentRound;
    if (round === null || round.ended) return taps;
    await engine.handle({ matchId: p.id, kind: 'draw', dueAt: Date.now() });
    if (await tapNewest(p)) taps += 1;
    const drawIndex =
      ((await engine.runner.current(p.id)).state.currentRound?.draws.length ?? 0) - 1;
    await engine.handle({
      matchId: p.id,
      kind: 'close_speed_window',
      dueAt: Date.now(),
      drawIndex,
    });
  }
  return taps;
}
