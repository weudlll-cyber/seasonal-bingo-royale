/**
 * @file   packages/domain/src/match/commandRules.test.ts
 * @module domain/match
 * @brief  Commands the match ignores at the wrong moment, so a client cannot cheat or break it.
 *
 * Responsibility: a tap on a number not drawn yet, on the free centre or on a cell already
 *                 marked produces no event (01 §6, 12 §6 anti-cheat); nobody joins after the
 *                 start; an ended match takes no abort and no draw.
 * Depends on:     ../index, ../../test/builders, ../../test/drive
 * Spec:           docs/spec/01-game-design.md §6, §7; docs/spec/12-testing-strategy.md §6
 */
import { describe, expect, it } from 'vitest';

import { createInitialMatchState, type Command, type MatchState } from '../index.js';
import { BUILTIN_CATALOGUE, classicRuleset, seed } from '../../test/builders.js';
import { drawAndClose, play } from '../../test/drive.js';

// A classic match where the person `h` taps; first round started, nothing drawn yet.
function started(): MatchState {
  const ruleset = {
    ...classicRuleset(),
    markingMode: 'manual' as const,
    missedNumbers: { kind: 'noAutoMark' as const },
  };
  const commands: Command[] = [
    {
      type: 'openLobby',
      matchId: 'm-rules',
      gameType: 'classic',
      ruleset,
      seed: seed(41),
      tickedPrizes: [...BUILTIN_CATALOGUE],
    },
    { type: 'joinMatch', accountId: 'h', joinedAt: 0, human: true },
    { type: 'joinMatch', accountId: 'b', joinedAt: 1 },
    { type: 'startMatch' },
    { type: 'startRound' },
  ];
  return commands.reduce((s, c) => play(s, c).state, createInitialMatchState());
}

const tap = (cellIndex: number): Command => ({
  type: 'markCell',
  accountId: 'h',
  cardIndex: 0,
  cellIndex,
  inSpeedWindow: true,
  speedBonus: 5,
});

describe('taps the match ignores (01 §6, 12 §6)', () => {
  it('ignores a number not drawn yet, the free centre and a second tap', () => {
    let s = started();
    const cells = s.currentRound?.cards['h']?.[0]?.card.cells ?? [];
    const free = cells.findIndex((c) => c.kind === 'free');
    expect(play(s, tap(free)).events).toEqual([]);
    const firstNumber = cells.findIndex((c) => c.kind === 'number');
    expect(play(s, tap(firstNumber)).events).toEqual([]);
    // Draw until one of h's numbers comes, tap it once (marked), then again (nothing).
    for (let i = 0; i < 75; i += 1) {
      s = drawAndClose(s);
      const drawn = s.currentRound?.draws ?? [];
      const hit = cells.findIndex((c) => c.kind === 'number' && drawn.includes(c.value));
      if (hit < 0) continue;
      const first = play(s, tap(hit));
      expect(first.events.some((e) => e.type === 'cellMarked')).toBe(true);
      expect(play(first.state, tap(hit)).events).toEqual([]);
      return;
    }
    throw new Error('no number of the card was drawn');
  });
});

describe('commands at the wrong moment (01 §7)', () => {
  it('lets nobody join after the start', () => {
    expect(play(started(), { type: 'joinMatch', accountId: 'late', joinedAt: 9 }).events).toEqual(
      [],
    );
  });

  it('takes no abort and no draw once the match was aborted', () => {
    const aborted = play(started(), { type: 'abortMatch', reason: 'test', by: 'host' }).state;
    expect(aborted.phase).toBe('aborted');
    expect(play(aborted, { type: 'abortMatch', reason: 'again', by: 'host' }).events).toEqual([]);
    expect(play(aborted, { type: 'drawNext' }).events).toEqual([]);
  });
});
