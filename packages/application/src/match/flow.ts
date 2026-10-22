/**
 * @file   packages/application/src/match/flow.ts
 * @module application/match
 * @brief  The timed flow of a live match: what each scheduled action does and schedules next.
 *
 * Responsibility: start_match starts the match and its first round; auto_start begins the
 *                 countdown of a set start time (./startRules, D16); start_round deals the
 *                 cards and, with timed draws, schedules the first draw one interval
 *                 later; a draw schedules the missed-number auto-mark (when people tap
 *                 under autoMarkAfter) and the close of its speed window; the window close
 *                 checks the round end — a round ended this way is cut and the next round
 *                 starts after a pause (its start time is recorded in the event log and goes
 *                 to the screens as nextRoundAt), the next stage begins or the match finishes — or,
 *                 with timed draws, schedules the next draw one interval after this one.
 *                 Host draws follow the same path from the host's Draw next (D8, D10).
 * Depends on:     @sbr/domain, ./ports, ./runner, ./startRules
 * Used by:        ./engine
 * Spec:           docs/spec/01-game-design.md §5, §6, §7; docs/spec/06-realtime-architecture.md §5
 */
import { nextStep } from '@sbr/domain';

import type { Clock, LoadedMatch, MatchStore, ScheduledAction, Scheduler } from './ports.js';
import type { MatchRunner } from './runner.js';
import { autoStart } from './startRules.js';

export interface FlowDeps {
  readonly runner: MatchRunner;
  readonly store: MatchStore;
  readonly scheduler: Scheduler;
  readonly clock: Clock;
}

export async function runAction(deps: FlowDeps, action: ScheduledAction): Promise<void> {
  switch (action.kind) {
    case 'start_match':
      return startMatch(deps, action.matchId);
    case 'auto_start':
      return autoStart(deps, action.matchId);
    case 'start_round':
      return startRound(deps, action.matchId);
    case 'draw':
      await draw(deps, action.matchId);
      return;
    case 'close_speed_window':
      return closeWindow(deps, action.matchId, action.drawIndex ?? -1);
    case 'auto_mark':
      await deps.runner.apply(
        action.matchId,
        [{ type: 'autoMarkMissed', drawIndex: action.drawIndex ?? -1 }],
        { mark: { source: 'auto', speedBonus: 0 } },
      );
      return;
  }
}

async function startMatch(deps: FlowDeps, matchId: string): Promise<void> {
  const produced = await deps.runner.apply(matchId, [{ type: 'startMatch' }]);
  if (produced.length === 0) return;
  await deps.store.setStatus(matchId, 'running');
  deps.runner.update(matchId, (m) => ({ ...m, record: { ...m.record, status: 'running' } }));
  await advance(deps, matchId, false);
}

// Ends the match without a result, with a reason and who ended it (D17).
export async function stopMatch(
  deps: FlowDeps,
  matchId: string,
  reason: string,
  by: 'host' | 'system',
): Promise<void> {
  // A match that has already ended keeps its status (the domain produces nothing).
  const produced = await deps.runner.apply(matchId, [{ type: 'abortMatch', reason, by }]);
  if (produced.length === 0) return;
  await deps.store.setStatus(matchId, 'aborted');
  deps.runner.update(matchId, (x) => ({ ...x, record: { ...x.record, status: 'aborted' } }));
  await deps.scheduler.cancel(matchId);
}

// After the match started or a round (and its cut) is over: next round, stage or finish.
async function advance(deps: FlowDeps, matchId: string, pause: boolean): Promise<void> {
  for (let safety = 0; safety < 20; safety += 1) {
    const m = await deps.runner.current(matchId);
    const step = nextStep(m.state);
    if (step === 'startStage') {
      await deps.runner.apply(matchId, [{ type: 'startStage' }]);
      continue;
    }
    if (step === 'finish') {
      await deps.runner.apply(matchId, [{ type: 'finishMatch' }]);
      await deps.store.setStatus(matchId, 'finished');
      deps.runner.update(matchId, (x) => ({ ...x, record: { ...x.record, status: 'finished' } }));
      await deps.scheduler.cancel(matchId);
      return;
    }
    if (pause) return pauseBeforeRound(deps, m);
    return startRound(deps, matchId);
  }
}

// The pause after a round and its cut (D14): wait the chosen seconds, or until the host
// starts the next round (engine.startNextRound). The screens learn of it either way.
async function pauseBeforeRound(deps: FlowDeps, m: LoadedMatch): Promise<void> {
  const matchId = m.record.id;
  const pause = m.record.settings.roundPause;
  if (pause.kind === 'host') {
    deps.runner.update(matchId, (x) => x);
    return;
  }
  const dueAt = deps.clock.now() + pause.ms;
  await deps.scheduler.schedule({ matchId, kind: 'start_round', dueAt });
  // In the event log, so the countdown on the cut screen survives a restart.
  await deps.runner.apply(matchId, [{ type: 'scheduleNextRound', at: dueAt }]);
}

// The match waits for its host to start the next round (D14): derived from the state, so
// it survives a restart.
export function waitingForHost(m: LoadedMatch): boolean {
  if (m.record.settings.roundPause.kind !== 'host' || m.state.phase !== 'running') return false;
  const round = m.state.currentRound;
  return (round === null || round.ended) && nextStep(m.state) === 'startRound';
}

// The host's "Start next round" (D14); false when the match is not waiting for it.
export async function startNextRound(deps: FlowDeps, matchId: string): Promise<boolean> {
  if (!waitingForHost(await deps.runner.current(matchId))) return false;
  await startRound(deps, matchId);
  deps.runner.update(matchId, (x) => x);
  return true;
}

async function startRound(deps: FlowDeps, matchId: string): Promise<void> {
  const produced = await deps.runner.apply(matchId, [{ type: 'startRound' }]);
  if (produced.length === 0) return;
  const m = await deps.runner.current(matchId);
  if (m.record.settings.drawMode === 'auto') {
    const dueAt = deps.clock.now() + m.record.settings.drawIntervalMs;
    await deps.scheduler.schedule({ matchId, kind: 'draw', dueAt });
  }
}

// When the next number may be drawn: the match's timed-draw interval after the round's
// last draw (D13 for host draws; never shorter than D12). Null before the round's first
// draw (it may come at once) and outside a running round.
export function nextDrawAt(m: LoadedMatch): number | null {
  const round = m.state.currentRound;
  if (round === null || round.ended || round.draws.length === 0) return null;
  const last = m.drawTimes[round.draws.length - 1];
  return last === undefined ? null : last + m.record.settings.drawIntervalMs;
}

// A draw may happen only while the round runs and the previous draw's window has closed.
export function canDraw(m: LoadedMatch): boolean {
  const round = m.state.currentRound;
  if (round === null || round.ended || m.state.phase !== 'running') return false;
  return round.windowClosedThrough === round.draws.length - 1;
}

export async function draw(deps: FlowDeps, matchId: string): Promise<boolean> {
  const before = await deps.runner.current(matchId);
  if (!canDraw(before)) return false;
  const produced = await deps.runner.apply(matchId, [{ type: 'drawNext' }]);
  const made = produced.find((e) => e.type === 'drawMade');
  if (made?.type !== 'drawMade') return false;
  const m = await deps.runner.current(matchId);
  const now = deps.clock.now();
  const rule = m.record.settings.missedNumbers;
  const tapping = m.record.settings.markingMode === 'manual';
  // Scheduled before the window close: at the same moment the auto-mark runs first, so
  // a number marked exactly at the window close still counts (D10).
  if (tapping && rule.kind === 'autoMarkAfter') {
    const auto = { matchId, kind: 'auto_mark', drawIndex: made.drawIndex } as const;
    await deps.scheduler.schedule({ ...auto, dueAt: now + rule.delayMs });
  }
  const windowMs = m.record.ruleset.marking.speedWindowMs;
  const close = { matchId, kind: 'close_speed_window', drawIndex: made.drawIndex } as const;
  await deps.scheduler.schedule({ ...close, dueAt: now + windowMs });
  return true;
}

async function closeWindow(deps: FlowDeps, matchId: string, drawIndex: number): Promise<void> {
  const produced = await deps.runner.apply(matchId, [
    { type: 'closeSpeedWindow', drawIndex },
    { type: 'endRound' },
  ]);
  if (produced.some((e) => e.type === 'roundEnded')) {
    await deps.runner.apply(matchId, [{ type: 'applyCut' }]);
    await advance(deps, matchId, true);
    return;
  }
  const m = await deps.runner.current(matchId);
  if (m.record.settings.drawMode !== 'auto') return;
  const drawnAt = m.drawTimes[drawIndex] ?? deps.clock.now();
  const dueAt = Math.max(deps.clock.now(), drawnAt + m.record.settings.drawIntervalMs);
  await deps.scheduler.schedule({ matchId, kind: 'draw', dueAt });
}
