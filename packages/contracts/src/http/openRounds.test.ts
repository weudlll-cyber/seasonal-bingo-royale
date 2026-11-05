/**
 * @file   packages/contracts/src/http/openRounds.test.ts
 * @module contracts/http
 * @brief  The open-rounds answer follows the contract shared with the website (docs/OPEN-ROUNDS.md).
 *
 * Responsibility: a valid answer passes; too many rounds, a long id or title, a negative player
 *                 count, a join URL that is not https and an unknown version are refused; extra
 *                 fields are allowed (the website ignores them).
 * Depends on:     vitest, ./openRounds
 * Spec:           docs/OPEN-ROUNDS.md
 */
import { describe, expect, it } from 'vitest';

import { openRoundsAnswer } from './openRounds.js';

const round = {
  id: '0f8fad5b-d9cb-469f-a165-70867728950e',
  title: 'Friday royale',
  kind: 'Seasonal Bingo Royale',
  startsAt: '2026-11-06T19:00:00.000Z',
  signupClosesAt: null,
  players: 3,
  maxPlayers: 40,
  joinUrl: 'https://example.org/games/bingo/#/match/ABC123',
};

describe('the open-rounds contract', () => {
  it('takes a valid answer, also with extra fields', () => {
    expect(openRoundsAnswer.safeParse({ version: 1, rounds: [round] }).success).toBe(true);
    expect(openRoundsAnswer.safeParse({ version: 1, rounds: [], extra: 1 }).success).toBe(true);
  });

  it.each([
    ['21 rounds', { version: 1, rounds: Array(21).fill(round) }],
    ['a long id', { version: 1, rounds: [{ ...round, id: 'x'.repeat(65) }] }],
    ['a long title', { version: 1, rounds: [{ ...round, title: 'x'.repeat(81) }] }],
    ['negative players', { version: 1, rounds: [{ ...round, players: -1 }] }],
    ['an http join URL', { version: 1, rounds: [{ ...round, joinUrl: 'http://example.org/' }] }],
    ['another version', { version: 2, rounds: [] }],
  ])('refuses %s', (_what, answer) => {
    expect(openRoundsAnswer.safeParse(answer).success).toBe(false);
  });
});
