/**
 * @file   packages/domain/src/classic/classicRound.ts
 * @module domain/classic
 * @brief  Simulate one classic round (01 §3a) and award every ticked prize.
 *
 * Responsibility: given a seed, a list of players with cards and the ticked prize keys,
 *                 compute the draw-by-draw progression of a classic round. The round
 *                 ends on the draw that completes the last outstanding prize; every
 *                 player who completes a prize on the same draw wins it (invariant 12
 *                 of 12 §3). A prize is awarded at most once per account per round.
 *                 Pure: same inputs give the same output.
 * Depends on:     ../draw/drawSequence, ../draw/pool, ../card/patterns, ../card/cardTypes
 * Used by:        apps/server match orchestration, WP-08
 * Spec:           docs/spec/01-game-design.md §3a, docs/spec/12-testing-strategy.md §3 inv. 12
 */
import type { Card, Cell } from '../card/cardTypes.js';
import { CELL_COUNT } from '../card/cardTypes.js';
import { completedPrizeKeys } from '../card/patterns.js';
import { drawSequence } from '../draw/drawSequence.js';
import type { GameType } from '../gameType.js';

export interface ClassicPlayer {
  readonly accountId: string;
  readonly joinedAt: number;
  readonly card: Card;
}

export interface ClassicRoundInput {
  readonly seed: Uint8Array;
  readonly matchId: string;
  readonly roundIndex: number;
  readonly gameType: GameType;
  readonly players: readonly ClassicPlayer[];
  readonly tickedPrizes: readonly string[];
}

export interface PrizeAward {
  readonly prizeKey: string;
  readonly accountId: string;
  readonly drawIndex: number;
}

export interface ClassicRoundResult {
  readonly draws: readonly number[]; // the ordered items actually drawn before the round ended
  readonly awards: readonly PrizeAward[];
  // Per-player end-of-round marks bitmask, in input order, used for the placement
  // tie-break of 01 §3a.2 (number of marks on the player's card).
  readonly marksByAccount: Readonly<Record<string, readonly boolean[]>>;
}

export function simulateClassicRound(input: ClassicRoundInput): ClassicRoundResult {
  const sequence = drawSequence({
    seed: input.seed,
    matchId: input.matchId,
    roundIndex: input.roundIndex,
    gameType: input.gameType,
  });
  const marks = initialMarks(input.players);
  const awards: PrizeAward[] = [];
  const awardedByPrize = new Set<string>(); // prize keys fully awarded
  const outstanding = new Set<string>(input.tickedPrizes);
  const drawn: number[] = [];
  for (let drawIndex = 0; drawIndex < sequence.length; drawIndex += 1) {
    const item = sequence[drawIndex];
    if (item === undefined) break;
    drawn.push(item);
    applyDraw(input.players, marks, item);
    awardOnThisDraw({ players: input.players, marks, drawIndex, outstanding }, awards);
    for (const key of outstanding) {
      if (prizeFullyAwarded(key, awards)) {
        awardedByPrize.add(key);
      }
    }
    for (const key of awardedByPrize) outstanding.delete(key);
    if (outstanding.size === 0) break;
  }
  return { draws: drawn, awards, marksByAccount: marks };
}

function initialMarks(players: readonly ClassicPlayer[]): Record<string, boolean[]> {
  const marks: Record<string, boolean[]> = {};
  for (const player of players) {
    marks[player.accountId] = player.card.cells.map((cell) => cell.kind === 'free');
  }
  return marks;
}

function applyDraw(
  players: readonly ClassicPlayer[],
  marks: Record<string, boolean[]>,
  item: number,
): void {
  for (const player of players) {
    const row = marks[player.accountId];
    if (row === undefined) continue;
    for (let cellIndex = 0; cellIndex < CELL_COUNT; cellIndex += 1) {
      if (row[cellIndex]) continue;
      if (cellMatches(player.card.cells[cellIndex], item)) row[cellIndex] = true;
    }
  }
}

function cellMatches(cell: Cell | undefined, item: number): boolean {
  if (cell === undefined || cell.kind === 'free') return false;
  if (cell.kind === 'number') return cell.value === item;
  return cell.value === item;
}

interface AwardScan {
  readonly players: readonly ClassicPlayer[];
  readonly marks: Record<string, boolean[]>;
  readonly drawIndex: number;
  readonly outstanding: ReadonlySet<string>;
}

function awardOnThisDraw(scan: AwardScan, awards: PrizeAward[]): void {
  for (const player of scan.players) {
    const row = scan.marks[player.accountId];
    if (row === undefined) continue;
    const completed = completedPrizeKeys(row);
    for (const prizeKey of completed) {
      if (!scan.outstanding.has(prizeKey)) continue;
      if (awards.some((a) => a.prizeKey === prizeKey && a.accountId === player.accountId)) continue;
      awards.push({ prizeKey, accountId: player.accountId, drawIndex: scan.drawIndex });
    }
  }
}

// A prize is fully awarded once the first draw that completed it is in the past: all
// simultaneous completions on that draw have been recorded by awardOnThisDraw above.
function prizeFullyAwarded(prizeKey: string, awards: readonly PrizeAward[]): boolean {
  return awards.some((a) => a.prizeKey === prizeKey);
}
