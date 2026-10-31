/**
 * @file   packages/application/src/match/engine.ts
 * @module application/match
 * @brief  The live match engine: create, join, bots, start, draw control, marks, abort.
 *
 * Responsibility: the use cases of a realtime match on top of the domain lifecycle. A
 *                 match is created from the published default ruleset of its game type
 *                 with the starter's choices (prizes, draw mode and seconds, missed-number
 *                 rule); players join while the lobby is open; development bots join as
 *                 non-tapping players; start schedules the match after a countdown;
 *                 scheduled actions run through ./flow; the host draws in host mode (not
 *                 before the timed interval since the last draw, D13), starts the next
 *                 round when the match waits for it (D14), and switches draw mode or
 *                 seconds at any time (D8, never below D12); a tap is scored with the
 *                 speed bonus from the time since its draw (01 §6); `recover` continues a
 *                 match after a crash. Every command for a match runs through ./runner.
 * Depends on:     @sbr/contracts, @sbr/domain, ./ports, ./runner, ./flow, ./timing,
 *                 ./startRules (set time, start when full), ./create
 * Used by:        apps/server (HTTP routes, WebSocket gateway, scheduler), ../index, ./fakes
 * Spec:           docs/spec/01-game-design.md §3–§8; docs/spec/05-api-design.md §2.3; docs/spec/06-realtime-architecture.md §4–§5
 */
import { speedBonus, type Command } from '@sbr/domain';

import {
  canDraw,
  draw,
  nextDrawAt,
  resumeMatch,
  runAction,
  startNextRound,
  stopMatch,
  type FlowDeps,
} from './flow.js';
import { prizesFor, toNewMatch, type CreateMatchInput } from './create.js';
import type {
  Clock,
  DrawMode,
  MatchEventBus,
  MatchRecord,
  MatchStore,
  ScheduledAction,
  Scheduler,
} from './ports.js';
import { MatchRunner } from './runner.js';
import {
  minPlayersOf,
  planAutoStart,
  scheduleStart,
  startIfFull,
  startTimeValid,
} from './startRules.js';
import { withinDrawRange } from './timing.js';

export class MatchError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

interface EngineDeps {
  readonly store: MatchStore;
  readonly scheduler: Scheduler;
  readonly bus: MatchEventBus;
  readonly clock: Clock;
  readonly randomSeed: () => Uint8Array;
  readonly randomCode: () => string;
}

export class MatchEngine {
  readonly runner: MatchRunner;
  private readonly flow: FlowDeps;

  constructor(private readonly deps: EngineDeps) {
    this.runner = new MatchRunner(deps.store, deps.bus, deps.clock);
    this.flow = {
      runner: this.runner,
      store: deps.store,
      scheduler: deps.scheduler,
      clock: deps.clock,
    };
  }

  async create(input: CreateMatchInput, createdBy: string | null): Promise<MatchRecord> {
    const prizes = prizesFor(input);
    if (prizes === null) throw new MatchError('INVALID_PRIZES');
    if (!startTimeValid(input.startRule, this.deps.clock.now())) {
      throw new MatchError('START_TIME_INVALID');
    }
    const created = toNewMatch(input, prizes, {
      id: crypto.randomUUID(),
      code: this.deps.randomCode(),
      seed: this.deps.randomSeed(),
      createdBy,
    });
    await this.deps.store.insert(created.record);
    await this.runner.apply(created.record.id, [created.openLobby]);
    // A set start time with the automatic start on: through the scheduler (D16).
    await planAutoStart(this.flow, await this.runner.current(created.record.id));
    return { ...created.record, status: 'lobby', startsAt: null };
  }

  // The console's "Start automatically at the start time", until the match starts (D16).
  setAutoStart(matchId: string, auto: boolean): Promise<MatchRecord> {
    return this.runner.serial(matchId, async () => {
      const m = await this.runner.current(matchId);
      const rule = m.record.settings.startRule;
      if (m.record.status !== 'lobby' || m.record.startsAt !== null) {
        throw new MatchError('MATCH_NOT_IN_LOBBY');
      }
      if (rule.kind !== 'at') throw new MatchError('NO_START_TIME');
      const settings = { ...m.record.settings, startRule: { ...rule, auto } };
      await this.deps.store.setStartRule(matchId, settings.startRule);
      this.runner.update(matchId, (x) => ({ ...x, record: { ...x.record, settings } }));
      await planAutoStart(this.flow, await this.runner.current(matchId));
      return { ...m.record, settings };
    });
  }

  join(matchId: string, playerId: string, human: boolean): Promise<void> {
    return this.runner.serial(matchId, async () => {
      const m = await this.runner.current(matchId);
      if (m.record.status !== 'lobby' || m.state.phase !== 'lobby') {
        throw new MatchError('MATCH_NOT_IN_LOBBY');
      }
      if (m.state.players[playerId] !== undefined) return;
      if (m.state.playerOrder.length >= m.record.maxPlayers) throw new MatchError('MATCH_FULL');
      const joinedAt = this.deps.clock.now();
      const command: Command = human
        ? { type: 'joinMatch', accountId: playerId, joinedAt, human: true }
        : { type: 'joinMatch', accountId: playerId, joinedAt };
      await this.runner.apply(matchId, [command], { actorAccountId: human ? playerId : null });
      await startIfFull(this.flow, await this.runner.current(matchId));
    });
  }

  // Development only: fills the lobby up to `upTo` players with bots that mark on the draw.
  async fillWithBots(matchId: string, upTo: number): Promise<void> {
    const m = await this.runner.current(matchId);
    const target = Math.min(upTo, m.record.maxPlayers);
    let n = m.state.playerOrder.filter((id) => id.startsWith('bot-')).length;
    for (let count = m.state.playerOrder.length; count < target; count += 1) {
      n += 1;
      await this.join(matchId, `bot-${String(n).padStart(2, '0')}`, false);
    }
  }

  start(matchId: string, countdownMs: number): Promise<number> {
    return this.runner.serial(matchId, async () => {
      const m = await this.runner.current(matchId);
      if (m.record.status !== 'lobby') throw new MatchError('MATCH_NOT_IN_LOBBY');
      if (m.state.playerOrder.length < minPlayersOf(m)) throw new MatchError('NOT_ENOUGH_PLAYERS');
      const startsAt = this.deps.clock.now() + countdownMs;
      await scheduleStart(this.flow, matchId, startsAt);
      return startsAt;
    });
  }

  // Called by the scheduler for every due action.
  handle(action: ScheduledAction): Promise<void> {
    return this.runner.serial(action.matchId, () => runAction(this.flow, action));
  }

  // At start-up: continues a match that stopped between a round end and its next step.
  recover(matchId: string): Promise<void> {
    return this.runner.serial(matchId, () => resumeMatch(this.flow, matchId));
  }

  drawNext(matchId: string): Promise<void> {
    return this.runner.serial(matchId, async () => {
      const m = await this.runner.current(matchId);
      if (m.record.settings.drawMode !== 'host') throw new MatchError('DRAW_MODE_AUTO');
      if (!canDraw(m)) throw new MatchError('DRAW_NOT_ALLOWED');
      // D13: not before the next number would have come under timed draws.
      const unlocksAt = nextDrawAt(m);
      if (unlocksAt !== null && this.deps.clock.now() < unlocksAt) {
        throw new MatchError('DRAW_TOO_EARLY');
      }
      await draw(this.flow, matchId);
    });
  }

  // The host starts the next royale round when the match waits for it (D14), or ends a
  // timed pause early (D21).
  startNextRound(matchId: string): Promise<void> {
    return this.runner.serial(matchId, async () => {
      if (!(await startNextRound(this.flow, matchId))) throw new MatchError('NOT_WAITING_FOR_HOST');
    });
  }

  // Switch timed (`auto`) and host draws or change the seconds at any time (D8). Timed
  // draws resume one interval after the change (06 §4.2).
  setDrawControl(matchId: string, drawMode: DrawMode, intervalMs?: number): Promise<MatchRecord> {
    return this.runner.serial(matchId, async () => {
      const m = await this.runner.current(matchId);
      const windowMs = m.record.ruleset.marking.speedWindowMs;
      const drawIntervalMs = withinDrawRange(
        intervalMs ?? m.record.settings.drawIntervalMs,
        windowMs,
        m.record.settings.missedNumbers,
      );
      await this.deps.store.setDrawControl(matchId, drawMode, drawIntervalMs);
      const settings = { ...m.record.settings, drawMode, drawIntervalMs };
      this.runner.update(matchId, (x) => ({ ...x, record: { ...x.record, settings } }));
      await this.deps.scheduler.cancel(matchId, 'draw');
      if (drawMode === 'auto' && canDraw(m)) {
        const dueAt = this.deps.clock.now() + drawIntervalMs;
        await this.deps.scheduler.schedule({ matchId, kind: 'draw', dueAt });
      }
      return { ...m.record, settings };
    });
  }

  // A tap: accepted when the domain marks the cell; the speed bonus runs from its draw.
  mark(matchId: string, playerId: string, cardIndex: number, cellIndex: number): Promise<boolean> {
    return this.runner.serial(matchId, async () => {
      const m = await this.runner.current(matchId);
      const round = m.state.currentRound;
      const cell = round?.cards[playerId]?.[cardIndex]?.card.cells[cellIndex];
      if (round === null || cell === undefined || cell.kind === 'free') return false;
      const drawIndex = round.draws.indexOf(cell.value);
      const delta = this.deps.clock.now() - (m.drawTimes[drawIndex] ?? 0);
      const windowMs = m.record.ruleset.marking.speedWindowMs;
      const bonus = speedBonus(
        { maxBonus: m.record.ruleset.scoring.maxSpeedBonus, windowMs },
        delta,
      );
      const produced = await this.runner.apply(
        matchId,
        [
          {
            type: 'markCell',
            accountId: playerId,
            cardIndex,
            cellIndex,
            inSpeedWindow: delta <= windowMs,
            speedBonus: bonus,
          },
        ],
        {
          actorAccountId: playerId,
          mark: { source: 'manual', speedBonus: delta <= windowMs ? bonus : 0 },
        },
      );
      return produced.length > 0;
    });
  }

  // Ends the match without a result: by its host, or by the system (D17).
  abort(matchId: string, reason: string, by: 'host' | 'system'): Promise<void> {
    return this.runner.serial(matchId, () => stopMatch(this.flow, matchId, reason, by));
  }
}
