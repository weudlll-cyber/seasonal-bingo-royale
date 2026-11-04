/**
 * @file   packages/application/src/match/taps.ts
 * @module application/match
 * @brief  Players' taps, applied together when they wait in the match's queue (load check, 12 §5).
 *
 * Responsibility: a tap is timed when it arrives (its speed bonus runs from its draw to that
 *                 moment, not to when the queue reaches it) and waits with the match's other
 *                 taps; the first one to reach the match's queue takes all that are waiting and
 *                 applies them in one batch (one transaction, one frame), so 200 tapping players
 *                 no longer hold up the draws with one transaction per tap. Each tap is answered
 *                 on its own: accepted when the batch marked its cell. An observer learns each
 *                 batch's size, each tap's wait from arrival to the batch's start and the time
 *                 the batch took to decide, append and publish (the tap breakdown of 12 §5).
 * Depends on:     @sbr/domain, ./ports, ./runner
 * Used by:        ./engine
 * Spec:           docs/spec/01-game-design.md §6; docs/spec/06-realtime-architecture.md §4;
 *                 docs/spec/12-testing-strategy.md §5
 */
import { speedBonus, type Command, type DomainEvent } from '@sbr/domain';

import { markKey, type Clock, type LoadedMatch } from './ports.js';
import type { ApplyTiming, MatchRunner } from './runner.js';

export interface TapBatchTiming extends ApplyTiming {
  readonly size: number;
  readonly waitsMs: readonly number[];
}

interface Tap {
  readonly playerId: string;
  readonly cardIndex: number;
  readonly cellIndex: number;
  readonly receivedAt: number;
  readonly answer: (accepted: boolean) => void;
  readonly fail: (error: unknown) => void;
}

export class TapQueue {
  // Per match, the taps waiting for the queue (a new list once a batch took them).
  private readonly waiting = new Map<string, Tap[]>();

  constructor(
    private readonly runner: MatchRunner,
    private readonly clock: Clock,
    private readonly observe: (batch: TapBatchTiming) => void = () => undefined,
  ) {}

  mark(matchId: string, playerId: string, cardIndex: number, cellIndex: number): Promise<boolean> {
    const receivedAt = this.clock.now(matchId);
    return new Promise((answer, fail) => {
      const tap = { playerId, cardIndex, cellIndex, receivedAt, answer, fail };
      const list = this.waiting.get(matchId);
      if (list !== undefined) {
        list.push(tap);
        return;
      }
      this.waiting.set(matchId, [tap]);
      void this.runner.serial(matchId, () => this.applyWaiting(matchId));
    });
  }

  private async applyWaiting(matchId: string): Promise<void> {
    const taps = this.waiting.get(matchId) ?? [];
    this.waiting.delete(matchId);
    const started = this.clock.now(matchId);
    const timing: ApplyTiming = { decideMs: 0, appendMs: 0, publishMs: 0 };
    try {
      const m = await this.runner.current(matchId);
      const commands = taps.flatMap((t) => markCommand(m, t));
      // The marks projection keeps a bonus only for a tap inside the speed window.
      const speedBonuses = new Map(
        commands.map((c) => [
          markKey(c.accountId, c.cardIndex, c.cellIndex),
          c.inSpeedWindow ? c.speedBonus : 0,
        ]),
      );
      const actors = new Set(commands.map((c) => c.accountId));
      const produced = await this.runner.apply(matchId, commands, {
        // One player's taps keep the player as the actor; a batch of several has none.
        actorAccountId: actors.size === 1 ? ([...actors][0] ?? null) : null,
        mark: { source: 'manual', speedBonuses },
        timing,
      });
      answerTaps(taps, produced);
      this.observe({
        ...timing,
        size: taps.length,
        waitsMs: taps.map((t) => started - t.receivedAt),
      });
    } catch (error) {
      for (const t of taps) t.fail(error);
    }
  }
}

type MarkCommand = Extract<Command, { type: 'markCell' }>;

// The domain command of one tap, its speed bonus from its draw to its arrival (01 §6).
function markCommand(m: LoadedMatch, t: Tap): MarkCommand[] {
  const round = m.state.currentRound;
  const cell = round?.cards[t.playerId]?.[t.cardIndex]?.card.cells[t.cellIndex];
  if (round === null || cell === undefined || cell.kind === 'free') return [];
  const delta = t.receivedAt - (m.drawTimes[round.draws.indexOf(cell.value)] ?? 0);
  const windowMs = m.record.ruleset.marking.speedWindowMs;
  const bonus = speedBonus({ maxBonus: m.record.ruleset.scoring.maxSpeedBonus, windowMs }, delta);
  return [
    {
      type: 'markCell',
      accountId: t.playerId,
      cardIndex: t.cardIndex,
      cellIndex: t.cellIndex,
      inSpeedWindow: delta <= windowMs,
      speedBonus: bonus,
      receivedAt: t.receivedAt,
    },
  ];
}

// A tap is accepted when the batch marked its cell; a second tap of the same cell is not.
function answerTaps(taps: readonly Tap[], produced: readonly DomainEvent[]): void {
  const marked = new Set(
    produced.flatMap((e) =>
      e.type === 'cellMarked' ? [markKey(e.accountId, e.cardIndex, e.cellIndex)] : [],
    ),
  );
  for (const t of taps) {
    const key = markKey(t.playerId, t.cardIndex, t.cellIndex);
    t.answer(marked.delete(key));
  }
}
