/**
 * @file   packages/domain/src/match/lastNumber.test.ts
 * @module domain/match
 * @brief  D10: a round ends when the speed window of its last draw closes (01 §6, §3a.1).
 *
 * Responsibility: the round end condition is met on a draw, but the round ends only
 *                 after that draw's speed window closes, so the last number can still be
 *                 tapped with bonus; a classic prize first completed on a draw goes to
 *                 everyone who completes it before that draw's window closes, and to
 *                 nobody else after.
 * Depends on:     ../index, ../../test/builders, ../../test/drive
 * Spec:           docs/spec/01-game-design.md §3a.1, §6; docs/spec/12-testing-strategy.md §3
 */
import { describe, expect, it } from 'vitest';

import {
  createInitialMatchState,
  type Command,
  type DomainEvent,
  type GameType,
  type MatchState,
} from '../index.js';
import { BUILTIN_CATALOGUE, classicRuleset, royaleRuleset, seed } from '../../test/builders.js';
import { drawAndClose, play } from '../../test/drive.js';

// A manual match with the person `h` and the bot `b`, first round started.
function setup(gameType: GameType, seedByte: number): MatchState {
  const base = gameType === 'royale' ? royaleRuleset() : classicRuleset();
  const ruleset = {
    ...base,
    markingMode: 'manual' as const,
    missedNumbers: { kind: 'noAutoMark' as const },
  };
  const commands: Command[] = [
    {
      type: 'openLobby',
      matchId: `m-d10-${String(seedByte)}`,
      gameType,
      ruleset,
      seed: seed(seedByte),
      tickedPrizes: [...BUILTIN_CATALOGUE],
    },
    { type: 'joinMatch', accountId: 'h', joinedAt: 0, human: true },
    { type: 'joinMatch', accountId: 'b', joinedAt: 1 },
    { type: 'startMatch' },
    { type: 'startRound' },
  ];
  return commands.reduce((s, c) => play(s, c).state, createInitialMatchState());
}

const lastDrawIndex = (s: MatchState): number => (s.currentRound?.draws.length ?? 0) - 1;

// h taps every drawn, open cell of its card inside the window; returns the events.
function tapAllDrawn(start: MatchState): { state: MatchState; events: DomainEvent[] } {
  let state = start;
  const events: DomainEvent[] = [];
  const round = start.currentRound;
  round?.cards['h']?.[0]?.card.cells.forEach((cell, cellIndex) => {
    if (cell.kind === 'free' || !round.draws.includes(cell.value)) return;
    const r = play(state, {
      type: 'markCell',
      accountId: 'h',
      cardIndex: 0,
      cellIndex,
      inSpeedWindow: true,
      speedBonus: 5,
    });
    state = r.state;
    events.push(...r.events);
  });
  return { state, events };
}

describe('the last number of a round (D10)', () => {
  it('the round does not end on the draw; only after its speed window has closed', () => {
    let state = setup('royale', 3);
    // royale stage 1 ends after 40 draws (drawCount).
    for (let i = 0; i < 39; i += 1) state = drawAndClose(state);
    state = play(state, { type: 'drawNext' }).state;
    expect(play(state, { type: 'endRound' }).events).toEqual([]);
    // The last number can still be tapped inside its window, with bonus.
    const tapped = tapAllDrawn(state);
    const lastItem = state.currentRound?.draws.at(-1);
    const lastCell = state.currentRound?.cards['h']?.[0]?.card.cells.findIndex(
      (c) => c.kind !== 'free' && c.value === lastItem,
    );
    if (lastCell !== undefined && lastCell >= 0) {
      expect(tapped.state.currentRound?.cards['h']?.[0]?.marks[lastCell]).toBe(true);
    }
    expect(tapped.events.some((e) => e.type === 'cellMarked' && e.markPoints > 10)).toBe(true);
    const closed = play(tapped.state, {
      type: 'closeSpeedWindow',
      drawIndex: lastDrawIndex(state),
    });
    expect(play(closed.state, { type: 'endRound' }).events).toEqual([
      { type: 'roundEnded', roundIndex: 0, reason: 'drawCount' },
    ]);
  });

  it('closes each window once, only for the latest draw', () => {
    let state = setup('royale', 3);
    state = play(state, { type: 'drawNext' }).state;
    state = play(state, { type: 'drawNext' }).state;
    expect(play(state, { type: 'closeSpeedWindow', drawIndex: 0 }).events).toEqual([]);
    state = play(state, { type: 'closeSpeedWindow', drawIndex: 1 }).state;
    expect(play(state, { type: 'closeSpeedWindow', drawIndex: 1 }).events).toEqual([]);
  });
});

// Draws until the bot is awarded a prize that h also completes by tapping its drawn
// cells; returns the state right after that draw (window still open) and the prize.
function findSharedPrize(): { state: MatchState; prize: string } {
  for (let byte = 1; byte < 60; byte += 1) {
    let state = setup('classic', byte);
    for (let draw = 0; draw < 75 && state.currentRound?.ended === false; draw += 1) {
      const r = play(state, { type: 'drawNext' });
      const botPrizes = r.events.flatMap((e) =>
        e.type === 'classicPrizeAwarded' && e.accountId === 'b' ? [e.prizeKey] : [],
      );
      const won = tapAllDrawn(r.state).events.flatMap((e) =>
        e.type === 'classicPrizeAwarded' && e.accountId === 'h' ? [e.prizeKey] : [],
      );
      const shared = botPrizes.find((k) => won.includes(k));
      if (shared !== undefined) return { state: r.state, prize: shared };
      state = play(r.state, { type: 'closeSpeedWindow', drawIndex: lastDrawIndex(r.state) }).state;
      state = play(state, { type: 'endRound' }).state;
    }
  }
  throw new Error('no seed with a prize the person could share');
}

describe('classic prizes are decided when the window closes (D10)', () => {
  const { state, prize } = findSharedPrize();
  const hWins = (s: MatchState) =>
    tapAllDrawn(s).events.some(
      (e) => e.type === 'classicPrizeAwarded' && e.accountId === 'h' && e.prizeKey === prize,
    );

  it('goes to everyone who completes it before the window of its first draw closes', () => {
    expect(hWins(state)).toBe(true);
  });

  it('goes to nobody else once that window has closed', () => {
    const closed = play(state, { type: 'closeSpeedWindow', drawIndex: lastDrawIndex(state) });
    expect(hWins(closed.state)).toBe(false);
  });
});
