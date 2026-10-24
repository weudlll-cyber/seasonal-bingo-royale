/**
 * @file   packages/domain/src/verifyMatch.ts
 * @module domain
 * @brief  "Verify this match": recompute a played match from its revealed seed (01 §9).
 *
 * Responsibility: given the revealed seed, the commitment published at match open and the
 *                 match's event log, check that sha256(seed) is the commitment, and that
 *                 every round's draw order, every draw made and every player's card in the
 *                 log are what the seed gives (./draw/drawSequence, ./card/generateCard,
 *                 the same labels the match used). The match id, game type and free-centre
 *                 rule come from the log's `lobbyOpened`; the seed in that event is never
 *                 read (the caller passes the revealed one). Pure.
 * Depends on:     ./card/generateCard, ./card/cardTypes, ./commitment, ./draw/drawSequence,
 *                 ./match/events
 * Used by:        ./index, ./verifyMatch.test
 * Spec:           docs/spec/01-game-design.md §9; docs/spec/12-testing-strategy.md §3 invariant 11
 */
import type { Card } from './card/cardTypes.js';
import { generateCard } from './card/generateCard.js';
import { verifyCommitment } from './commitment.js';
import { drawSequence } from './draw/drawSequence.js';
import type { DomainEvent, LobbyOpened, RoundStarted } from './match/events.js';

export interface RoundCheck {
  readonly roundIndex: number;
  // The round's whole draw order in the log equals the recomputed one.
  readonly drawOrderMatches: boolean;
  // Every draw made in the round took the recomputed number at its place.
  readonly drawsPlayed: number;
  readonly drawsMatch: boolean;
  // Every card dealt in the round equals the recomputed card.
  readonly cardsChecked: number;
  readonly cardsMatch: boolean;
}

export interface MatchVerification {
  readonly commitmentMatches: boolean;
  readonly rounds: readonly RoundCheck[];
  // True only when the commitment and every check of every round hold.
  readonly verified: boolean;
}

export interface VerifyMatchInput {
  readonly seed: Uint8Array;
  readonly commitment: Uint8Array;
  readonly events: readonly DomainEvent[];
}

export function verifyMatch(input: VerifyMatchInput): MatchVerification {
  const commitmentMatches = verifyCommitment(input.seed, input.commitment);
  const opened = input.events.find((e): e is LobbyOpened => e.type === 'lobbyOpened');
  if (opened === undefined) return { commitmentMatches, rounds: [], verified: false };
  const rounds: RoundCheck[] = [];
  let current: {
    start: RoundStarted;
    order: readonly number[];
    draws: number;
    ok: boolean;
  } | null = null;
  const close = (): void => {
    if (current === null) return;
    rounds.push({
      ...roundStartCheck(input.seed, opened, current.start, current.order),
      drawsPlayed: current.draws,
      drawsMatch: current.ok,
    });
  };
  for (const event of input.events) {
    if (event.type === 'roundStarted') {
      close();
      const order = drawSequence({
        seed: input.seed,
        matchId: opened.matchId,
        roundIndex: event.roundIndex,
        gameType: opened.gameType,
      });
      current = { start: event, order, draws: 0, ok: true };
    } else if (event.type === 'drawMade' && current !== null) {
      current.draws += 1;
      if (current.order[event.drawIndex] !== event.item) current.ok = false;
    }
  }
  close();
  const verified =
    commitmentMatches && rounds.every((r) => r.drawOrderMatches && r.drawsMatch && r.cardsMatch);
  return { commitmentMatches, rounds, verified };
}

// The checks a round start allows: its draw order and every card it dealt.
function roundStartCheck(
  seed: Uint8Array,
  opened: LobbyOpened,
  start: RoundStarted,
  order: readonly number[],
): Pick<RoundCheck, 'roundIndex' | 'drawOrderMatches' | 'cardsChecked' | 'cardsMatch'> {
  let cardsChecked = 0;
  let cardsMatch = true;
  for (const [accountId, cards] of Object.entries(start.cardsByPlayer)) {
    cards.forEach((card, cardIndex) => {
      cardsChecked += 1;
      const recomputed = generateCard({
        seed,
        matchId: opened.matchId,
        roundIndex: start.roundIndex,
        accountId,
        cardIndex,
        gameType: opened.gameType,
        freeCenter: opened.ruleset.freeCenter,
      });
      if (!sameCard(card, recomputed)) cardsMatch = false;
    });
  }
  return {
    roundIndex: start.roundIndex,
    drawOrderMatches: sameNumbers(start.drawSequence, order),
    cardsChecked,
    cardsMatch,
  };
}

function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((n, i) => n === b[i]);
}

// Field by field: a card read back from storage may carry its keys in another order.
function sameCard(a: Card, b: Card): boolean {
  if (a.cells.length !== b.cells.length) return false;
  const cellsSame = a.cells.every((cell, i) => {
    const other = b.cells[i];
    if (other === undefined || cell.kind !== other.kind) return false;
    return !('value' in cell) || ('value' in other && cell.value === other.value);
  });
  if (!cellsSame) return false;
  if (a.seasonCells === null || b.seasonCells === null) return a.seasonCells === b.seasonCells;
  return sameNumbers(a.seasonCells, b.seasonCells);
}
