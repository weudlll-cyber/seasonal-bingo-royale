/**
 * @file   packages/domain/src/verifyMatch.test.ts
 * @module domain
 * @brief  "Verify this match" recomputes a played match from its seed and finds any change.
 *
 * Responsibility: a simulated royale and a classicSeasons match verify with their own seed
 *                 and commitment (every round, every draw, every card); a different seed
 *                 fails the commitment and the recomputation, even with a commitment made
 *                 for it; a changed draw or a changed card in the log fails its round; a
 *                 log without `lobbyOpened` does not verify.
 * Depends on:     ./index, ../test/builders
 * Spec:           docs/spec/01-game-design.md §9; docs/spec/12-testing-strategy.md §3 invariant 11
 */
import { describe, expect, it } from 'vitest';

import { classicRuleset, royaleRuleset, seed } from '../test/builders.js';
import { commitSeed, simulateMatch, verifyMatch, type DomainEvent } from './index.js';

const SEED = seed(7);
const played = simulateMatch({
  matchId: 'm-verify',
  seed: SEED,
  gameType: 'royale',
  ruleset: royaleRuleset(),
  playerCount: 6,
  tickedPrizes: [],
}).events;

const roundsOf = (events: readonly DomainEvent[]) =>
  events.filter((e) => e.type === 'roundStarted').length;

describe('verifyMatch (01 §9)', () => {
  it('recomputes every round, draw and card of a played royale match', () => {
    const result = verifyMatch({ seed: SEED, commitment: commitSeed(SEED), events: played });
    expect(result.verified).toBe(true);
    expect(result.rounds).toHaveLength(roundsOf(played));
    expect(result.rounds.length).toBeGreaterThan(1);
    const draws = played.filter((e) => e.type === 'drawMade').length;
    expect(result.rounds.reduce((n, r) => n + r.drawsPlayed, 0)).toBe(draws);
    expect(result.rounds.every((r) => r.cardsChecked > 0)).toBe(true);
  });

  it('recomputes a classicSeasons match with its season cells', () => {
    const events = simulateMatch({
      matchId: 'm-verify-seasons',
      seed: SEED,
      gameType: 'classicSeasons',
      ruleset: classicRuleset(),
      playerCount: 4,
      tickedPrizes: ['fullCard'],
    }).events;
    expect(verifyMatch({ seed: SEED, commitment: commitSeed(SEED), events }).verified).toBe(true);
  });
});

describe('verifyMatch finds a change (01 §9)', () => {
  it('fails a different seed: the commitment, the draw orders and the cards', () => {
    const tampered = seed(8);
    const result = verifyMatch({ seed: tampered, commitment: commitSeed(SEED), events: played });
    expect(result.verified).toBe(false);
    expect(result.commitmentMatches).toBe(false);
    expect(result.rounds.every((r) => !r.drawOrderMatches && !r.cardsMatch)).toBe(true);
    // A commitment made for the other seed does not help: the play does not follow from it.
    const own = verifyMatch({ seed: tampered, commitment: commitSeed(tampered), events: played });
    expect(own.commitmentMatches).toBe(true);
    expect(own.verified).toBe(false);
  });

  it('fails the round whose draw or card was changed in the log', () => {
    const draw = played.findIndex((e) => e.type === 'drawMade');
    const changedDraw = played.map((e, i) =>
      i === draw && e.type === 'drawMade' ? { ...e, item: e.item === 1 ? 2 : 1 } : e,
    );
    const drawResult = verifyMatch({
      seed: SEED,
      commitment: commitSeed(SEED),
      events: changedDraw,
    });
    expect(drawResult.verified).toBe(false);
    expect(drawResult.rounds[0]).toMatchObject({ drawOrderMatches: true, drawsMatch: false });
    const changedCard = played.map((e) => {
      if (e.type !== 'roundStarted' || e.roundIndex !== 0) return e;
      const [first, ...rest] = Object.entries(e.cardsByPlayer);
      if (first === undefined) return e;
      const [id, cards] = first;
      const [card, ...others] = cards;
      if (card === undefined) return e;
      const swapped = { ...card, cells: [...card.cells].reverse() };
      return { ...e, cardsByPlayer: Object.fromEntries([[id, [swapped, ...others]], ...rest]) };
    });
    const cardResult = verifyMatch({
      seed: SEED,
      commitment: commitSeed(SEED),
      events: changedCard,
    });
    expect(cardResult.rounds[0]?.cardsMatch).toBe(false);
    expect(cardResult.rounds.slice(1).every((r) => r.cardsMatch)).toBe(true);
    expect(cardResult.verified).toBe(false);
  });

  it('does not verify a log without its lobby event', () => {
    const events = played.filter((e) => e.type !== 'lobbyOpened');
    expect(verifyMatch({ seed: SEED, commitment: commitSeed(SEED), events })).toEqual({
      commitmentMatches: true,
      rounds: [],
      verified: false,
    });
  });
});
