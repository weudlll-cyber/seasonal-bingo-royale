/**
 * @file   packages/domain/src/match/simulate.ts
 * @module domain/match
 * @brief  Full-match simulation driver for tests and the Quick Test (WP-07/WP-08).
 *
 * Responsibility: drive the lifecycle for a given seed, game type, player count and
 *                 ruleset end-to-end. Bots mark on the draw; optional human players never
 *                 tap here (their taps are not known in advance), so in manual marking
 *                 mode they are marked only by autoMarkMissed once the missed-number
 *                 delay has passed, measured in draw intervals (01 §6). Returns
 *                 the full event log and the final state so tests can assert both
 *                 "live state = replay" (invariant 4) and the game-wide invariants
 *                 (every ticked prize awarded, final placement 1..N, …). Pure.
 * Depends on:     ./commands, ./decide, ./evolve, ./matchState, ./lifecycleTypes
 * Used by:        tests, apps/server/src/dev/quicktest.ts
 * Spec:           docs/spec/15-implementation-plan.md WP-07 Accept; 01 §6;
 *                 12 §3 inv. 4, 7, 8, 10, 12, 17, 18
 */
import type { GameType } from '../gameType.js';
import { decide } from './decide.js';
import { createInitialMatchState, evolve } from './evolve.js';
import type { Command } from './commands.js';
import type { DomainEvent } from './events.js';
import type { MatchRuleset } from './lifecycleTypes.js';
import type { MatchState } from './matchState.js';

export interface SimulateMatchInput {
  readonly matchId: string;
  readonly seed: Uint8Array;
  readonly gameType: GameType;
  readonly ruleset: MatchRuleset;
  readonly playerCount: number;
  readonly tickedPrizes: readonly string[];
  // The first `count` players join as people. drawIntervalMs (time between two draws)
  // and speedWindowMs place the missed-number auto-marks and window closes in time.
  readonly humans?: {
    readonly count: number;
    readonly drawIntervalMs: number;
    readonly speedWindowMs: number;
  };
}

export interface SimulateMatchResult {
  readonly events: readonly DomainEvent[];
  readonly state: MatchState;
}

// A tiny closure the driver reuses to funnel commands into state + event log. decide is
// pure (no clock dependency on realtime drawing); the simulator sets ctx.now to zero.
interface Driver {
  readonly events: DomainEvent[];
  state: MatchState;
  apply(command: Command): readonly DomainEvent[];
}

function makeDriver(): Driver {
  const d: Driver = {
    events: [],
    state: createInitialMatchState(),
    apply(command: Command): readonly DomainEvent[] {
      const produced = decide(d.state, command, { now: 0 });
      for (const ev of produced) {
        d.events.push(ev);
        d.state = evolve(d.state, ev);
      }
      return produced;
    },
  };
  return d;
}

export function simulateMatch(input: SimulateMatchInput): SimulateMatchResult {
  const d = makeDriver();
  d.apply({
    type: 'openLobby',
    matchId: input.matchId,
    gameType: input.gameType,
    ruleset: input.ruleset,
    seed: input.seed,
    tickedPrizes: input.tickedPrizes,
  });
  for (let i = 0; i < input.playerCount; i += 1) {
    const accountId = `p${String(i).padStart(3, '0')}`;
    const human = i < (input.humans?.count ?? 0);
    d.apply({ type: 'joinMatch', accountId, joinedAt: i, ...(human ? { human } : {}) });
  }
  d.apply({ type: 'startMatch' });
  runStages(d, {
    intervalMs: input.humans?.drawIntervalMs ?? 0,
    windowMs: input.humans?.speedWindowMs ?? 0,
  });
  d.apply({ type: 'finishMatch' });
  return { events: d.events, state: d.state };
}

// Clock of a simulated round: draw n happens at n × intervalMs and its speed window
// closes windowMs later (01 §6, D10). Zero for a match without people: nothing is timed.
interface Clock {
  readonly intervalMs: number;
  readonly windowMs: number;
}

function runStages(d: Driver, clock: Clock): void {
  while (d.state.stageIndex < d.state.stagePlan.length) {
    const stage = d.state.stagePlan[d.state.stageIndex];
    if (stage === undefined) break;
    for (let r = 0; r < stage.rounds; r += 1) {
      // Once the active field is at or below the final size, the remaining elimination
      // rounds and stages are skipped (01 §7.4) — checked before every round.
      if (stage.kind === 'elimination' && fieldAtFinalSize(d.state)) break;
      runOneRound(d, clock);
    }
    const nextIndex = d.state.stageIndex + 1;
    if (nextIndex < d.state.stagePlan.length) d.apply({ type: 'startStage' });
    else break;
  }
}

// In time order per draw: the draw; the missed-number auto-marks due by the close of its
// speed window; the window close and the round-end check (a round never ends at the
// moment of a draw, D10); the auto-marks due before the next draw.
function runOneRound(d: Driver, clock: Clock): void {
  d.apply({ type: 'startRound' });
  let pending = 0; // first draw whose missed-number auto-mark has not been issued
  for (let safety = 0; safety < 2_000; safety += 1) {
    const n = d.state.currentRound?.draws.length ?? 0;
    pending = issueDueAutoMarks(d, pending, n * clock.intervalMs, clock);
    if (d.apply({ type: 'drawNext' }).length === 0) break;
    pending = issueDueAutoMarks(d, pending, n * clock.intervalMs + clock.windowMs, clock);
    d.apply({ type: 'closeSpeedWindow', drawIndex: n });
    if (d.apply({ type: 'endRound' }).length > 0) break;
  }
  // Belt-and-braces: the pool is exhausted and the last window has closed.
  if (d.state.currentRound !== null && !d.state.currentRound.ended) {
    d.apply({ type: 'endRound' });
  }
  d.apply({ type: 'applyCut' });
}

// Issue autoMarkMissed for every draw whose delay has passed by now: draw k is due at
// k × interval + delay (inclusive). Returns the new first pending draw.
function issueDueAutoMarks(d: Driver, pending: number, now: number, clock: Clock): number {
  const rule = d.state.ruleset.missedNumbers;
  const drawn = d.state.currentRound?.draws.length ?? 0;
  if (rule.kind !== 'autoMarkAfter' || clock.intervalMs <= 0) return drawn;
  let first = pending;
  while (first < drawn && first * clock.intervalMs + rule.delayMs <= now) {
    d.apply({ type: 'autoMarkMissed', drawIndex: first });
    first += 1;
  }
  return first;
}

function fieldAtFinalSize(state: MatchState): boolean {
  const finalStage = state.stagePlan[state.stagePlan.length - 1];
  if (finalStage === undefined || finalStage.kind !== 'final') return false;
  const active = state.playerOrder.filter(
    (id) => state.players[id]?.eliminatedAtRound === null,
  ).length;
  // No explicit "final size" is defined; we approximate by: once the next stage is
  // the final stage AND we have strictly more than the final's minimum, keep playing;
  // otherwise skip. The spec's phrasing "already at or below the final size" means we
  // never cut below minSurvivors, so apply-cut being a no-op naturally stops progress.
  return active <= (finalStage.cut?.minSurvivors ?? 2);
}
