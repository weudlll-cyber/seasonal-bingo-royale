/**
 * @file   packages/application/src/match/flow.ts
 * @module application/match
 * @brief  The timed flow of a live match: what each scheduled action does and schedules next.
 *
 * Responsibility: what each scheduled action does and schedules next: start_match, auto_start
 *                 (./startRules, D16), start_round (first timed draw), a draw (auto-mark and
 *                 window close), the window close (round end and cut in one batch, then a
 *                 pause and the next round, the next stage or the finish; else the next
 *                 timed draw). Steps derive from the state, so a retried action or the
 *                 start-up sweep (resumeMatch) continues a match after a crash (02 §5.3).
 *                 Host draws take the same path (D8, D10); the host starts the next round
 *                 after a host pause (D14) or ends a timed pause early (D21).
 * Depends on:     @sbr/domain, ./ports, ./runner, ./startRules
 * Used by:        ./engine, ../index, ./startRules
 * Spec:           docs/spec/01-game-design.md §5, §6, §7 (D14, D21);
 *                 docs/spec/02-software-architecture.md §5.3; docs/spec/06-realtime-architecture.md §5
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

// The pause after a round and its cut (D14): wait the chosen seconds (the host may end the
// wait early, D21), or until the host starts the next round (both engine.startNextRound).
// The screens learn of it either way.
async function pauseBeforeRound(deps: FlowDeps, m: LoadedMatch): Promise<void> {
  const matchId = m.record.id;
  const pause = m.record.settings.roundPause;
  if (pause.kind === 'host') {
    deps.runner.update(matchId, (x) => x);
    return;
  }
  const dueAt = deps.clock.now() + pause.ms;
  // Replaced, not doubled, when a retry or the start-up sweep (resumeMatch) gets here.
  await deps.scheduler.cancel(matchId, 'start_round');
  await deps.scheduler.schedule({ matchId, kind: 'start_round', dueAt });
  // In the event log, so the countdown on the cut screen survives a restart.
  await deps.runner.apply(matchId, [{ type: 'scheduleNextRound', at: dueAt }]);
}

// Between a round (and its cut) and the next one: derived from the state, so it survives
// a restart. A timed pause has its start time in the event log (nextRoundAt).
function inPause(m: LoadedMatch): boolean {
  if (m.state.phase !== 'running') return false;
  const round = m.state.currentRound;
  if (round !== null && !round.ended) return false;
  if (m.record.settings.roundPause.kind === 'wait' && m.state.nextRoundAt === null) return false;
  return nextStep(m.state) === 'startRound';
}

// The match waits for its host to start the next round (D14).
export function waitingForHost(m: LoadedMatch): boolean {
  return m.record.settings.roundPause.kind === 'host' && inPause(m);
}

// The host's "Start next round" (D14), and "Start next round now" in a timed pause (D21);
// false outside a pause.
export async function startNextRound(deps: FlowDeps, matchId: string): Promise<boolean> {
  const m = await deps.runner.current(matchId);
  if (!inPause(m)) return false;
  if (m.record.settings.roundPause.kind === 'wait') {
    // In the event log: the pause ended now, not at the time first announced.
    await deps.runner.apply(matchId, [{ type: 'scheduleNextRound', at: deps.clock.now() }]);
  }
  await startRound(deps, matchId);
  // The timed start is replaced, not doubled. Dropped after the round started: if the
  // server stops in between, the old start finds the round running and does nothing.
  await deps.scheduler.cancel(matchId, 'start_round');
  deps.runner.update(matchId, (x) => x);
  return true;
}

async function startRound(deps: FlowDeps, matchId: string): Promise<void> {
  await deps.runner.apply(matchId, [{ type: 'startRound' }]);
  const m = await deps.runner.current(matchId);
  const round = m.state.currentRound;
  if (m.record.settings.drawMode !== 'auto' || round === null || round.ended) return;
  // Also on a retry after a crash: a round without a draw yet gets its first timed draw.
  if (round.draws.length > 0) return;
  const dueAt = deps.clock.now() + m.record.settings.drawIntervalMs;
  await deps.scheduler.cancel(matchId, 'draw');
  await deps.scheduler.schedule({ matchId, kind: 'draw', dueAt });
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

// The round end and its cut go in one batch, one transaction, so no crash leaves an ended
// round uncut. What follows is derived from the state: a retried close, or the start-up
// sweep (resumeMatch), continues a match that stopped between the steps (audit H2).
async function closeWindow(deps: FlowDeps, matchId: string, drawIndex: number): Promise<void> {
  await deps.runner.apply(matchId, [
    { type: 'closeSpeedWindow', drawIndex },
    { type: 'endRound' },
    { type: 'applyCut' },
  ]);
  const m = await deps.runner.current(matchId);
  if (awaitsNextStep(m)) return advance(deps, matchId, true);
  if (m.record.settings.drawMode !== 'auto' || !canDraw(m)) return;
  if (drawIndex !== (m.state.currentRound?.draws.length ?? 0) - 1) return;
  const drawnAt = m.drawTimes[drawIndex] ?? deps.clock.now();
  const dueAt = Math.max(deps.clock.now(), drawnAt + m.record.settings.drawIntervalMs);
  // Replaced, not doubled, when a retry schedules it again.
  await deps.scheduler.cancel(matchId, 'draw');
  await deps.scheduler.schedule({ matchId, kind: 'draw', dueAt });
}

// A round (and its cut) is over but nothing follows yet: no next stage, finish or pause.
// A timed pause has its start time in the event log; a host pause has nothing to schedule.
function awaitsNextStep(m: LoadedMatch): boolean {
  const round = m.state.currentRound;
  if (m.state.phase !== 'running' || round === null || !round.ended) return false;
  return !(m.record.settings.roundPause.kind === 'wait' && m.state.nextRoundAt !== null);
}

// At start-up, for every running match: the step lost in a crash after a round end.
export async function resumeMatch(deps: FlowDeps, matchId: string): Promise<void> {
  if (awaitsNextStep(await deps.runner.current(matchId))) await advance(deps, matchId, true);
}
