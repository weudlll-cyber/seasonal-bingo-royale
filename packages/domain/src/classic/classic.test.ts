/**
 * @file   packages/domain/src/classic/classic.test.ts
 * @module domain/classic
 * @brief  Classic round simulation (12 §3 inv. 12) and placement.
 *
 * Responsibility: run full classic rounds for 4, 20 and 100 bot players over fixed
 *                 seeds and check the invariants: a prize is awarded exactly once per
 *                 (round, prize, account); every ticked prize is awarded before the
 *                 round ends OR the pool is exhausted; the round ends on the deciding
 *                 draw. Placement produces 1..N without gaps.
 * Depends on:     ../index
 * Spec:           docs/spec/12-testing-strategy.md §3 inv. 12, docs/spec/01-game-design.md §3a
 */
import { describe, expect, it } from 'vitest';

import {
  BUILTIN_PRIZE_CATALOGUE_ORDER,
  classicPlacement,
  generateCard,
  SEED_BYTES,
  simulateClassicRound,
  type ClassicPlayer,
  type GameType,
} from '../index.js';

const seed = (byte: number): Uint8Array => new Uint8Array(SEED_BYTES).fill(byte);

function makePlayers(count: number, gameType: GameType, matchId: string): ClassicPlayer[] {
  return Array.from({ length: count }, (_v, i) => {
    const accountId = `p${String(i).padStart(3, '0')}`;
    const card = generateCard({
      seed: seed(1),
      matchId,
      roundIndex: 0,
      accountId,
      cardIndex: 0,
      gameType,
      freeCenter: true,
    });
    return { accountId, joinedAt: i, card };
  });
}

const TICKED = ['rows-1', 'rows-2', 'fourCorners', 'oneDiagonal', 'fullCard'] as const;

describe('simulateClassicRound', () => {
  it.each<[number, GameType]>([
    [4, 'classic'],
    [4, 'classicSeasons'],
    [20, 'classic'],
    [20, 'classicSeasons'],
    [100, 'classic'],
  ])('awards every ticked prize for %i players in %s', (count, gameType) => {
    const matchId = `cl-${String(count)}-${gameType}`;
    const players = makePlayers(count, gameType, matchId);
    const result = simulateClassicRound({
      seed: seed(count),
      matchId,
      roundIndex: 0,
      gameType,
      players,
      tickedPrizes: [...TICKED],
    });
    const awardedKeys = new Set(result.awards.map((a) => a.prizeKey));
    for (const key of TICKED) expect(awardedKeys.has(key)).toBe(true);
  });

  it('a prize is awarded at most once per (round, prize, account)', () => {
    const players = makePlayers(20, 'classic', 'cl-unique');
    const result = simulateClassicRound({
      seed: seed(2),
      matchId: 'cl-unique',
      roundIndex: 0,
      gameType: 'classic',
      players,
      tickedPrizes: [...TICKED],
    });
    const seen = new Set<string>();
    for (const award of result.awards) {
      const key = `${award.prizeKey}:${award.accountId}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('ends on the draw that awards the last outstanding prize', () => {
    const players = makePlayers(10, 'classic', 'cl-end');
    const result = simulateClassicRound({
      seed: seed(3),
      matchId: 'cl-end',
      roundIndex: 0,
      gameType: 'classic',
      players,
      tickedPrizes: [...TICKED],
    });
    const lastDraw = result.draws.length - 1;
    // Some award is on the last-drawn index — i.e. the round did not run on past the
    // deciding draw. (Awards on earlier draws are allowed; the last one must sit on
    // the final draw.)
    expect(result.awards.some((a) => a.drawIndex === lastDraw)).toBe(true);
  });
});

describe('classicPlacement', () => {
  it('produces a 1..N total order without gaps', () => {
    const players = makePlayers(4, 'classic', 'cl-place');
    const result = simulateClassicRound({
      seed: seed(9),
      matchId: 'cl-place',
      roundIndex: 0,
      gameType: 'classic',
      players,
      tickedPrizes: [...TICKED],
    });
    const places = classicPlacement(
      players,
      result.awards,
      result.marksByAccount,
      BUILTIN_PRIZE_CATALOGUE_ORDER,
    );
    expect(places.map((p) => p.place)).toEqual([1, 2, 3, 4]);
    expect(new Set(places.map((p) => p.accountId)).size).toBe(places.length);
  });
});
