/**
 * @file   packages/domain/src/match/decideCards.ts
 * @module domain/match
 * @brief  Card-building helper used when a round starts (01 §4, §9).
 *
 * Responsibility: for every active player, deterministically generate `cardsPerPlayer`
 *                 cards from the match seed and the round index. Kept out of decide.ts
 *                 to keep that file under the 300-line limit.
 * Depends on:     ../card/generateCard, ../card/cardTypes, ./matchState
 * Used by:        ./decide
 * Spec:           docs/spec/01-game-design.md §4, §9
 */
import { generateCard, type GenerateCardInput } from '../card/generateCard.js';
import type { Card } from '../card/cardTypes.js';
import type { MatchState } from './matchState.js';

export function buildCards(
  state: MatchState,
  activeIds: readonly string[],
  roundIndex: number,
): Record<string, readonly Card[]> {
  const copies = Math.max(1, state.ruleset.cardsPerPlayer);
  const out: Record<string, Card[]> = {};
  for (const accountId of activeIds) {
    const cards: Card[] = [];
    for (let i = 0; i < copies; i += 1) {
      const input: GenerateCardInput = {
        seed: state.seed,
        matchId: state.matchId,
        roundIndex,
        accountId,
        cardIndex: i,
        gameType: state.gameType,
        freeCenter: state.ruleset.freeCenter,
      };
      cards.push(generateCard(input));
    }
    out[accountId] = cards;
  }
  return out;
}
