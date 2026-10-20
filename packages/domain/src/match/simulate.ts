/**
 * @file   packages/domain/src/match/simulate.ts
 * @module domain/match
 * @brief  Full-match simulation driver for tests and the Quick Test (WP-07/WP-08).
 *
 * Responsibility: drive the lifecycle for a given seed, game type, player count and
 *                 ruleset end-to-end with bot players in `auto` marking mode. Returns
 *                 the full event log and the final state so tests can assert both
 *                 "live state = replay" (invariant 4) and the game-wide invariants
 *                 (every ticked prize awarded, final placement 1..N, …). Pure.
 * Depends on:     ./commands, ./decide, ./evolve, ./matchState, ./lifecycleTypes
 * Used by:        tests, apps/server/src/dev/quicktest.ts
 * Spec:           docs/spec/15-implementation-plan.md WP-07 Accept; 12 §3 inv. 4, 7, 8, 10, 12
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
    d.apply({ type: 'joinMatch', accountId: `p${String(i).padStart(3, '0')}`, joinedAt: i });
  }
  d.apply({ type: 'startMatch' });
  runStages(d);
  d.apply({ type: 'finishMatch' });
  return { events: d.events, state: d.state };
}

function runStages(d: Driver): void {
  while (d.state.stageIndex < d.state.stagePlan.length) {
    const stage = d.state.stagePlan[d.state.stageIndex];
    if (stage === undefined) break;
    for (let r = 0; r < stage.rounds; r += 1) {
      // Once the active field is at or below the final size, the remaining elimination
      // rounds and stages are skipped (01 §7.4) — checked before every round.
      if (stage.kind === 'elimination' && fieldAtFinalSize(d.state)) break;
      runOneRound(d);
    }
    const nextIndex = d.state.stageIndex + 1;
    if (nextIndex < d.state.stagePlan.length) d.apply({ type: 'startStage' });
    else break;
  }
}

function runOneRound(d: Driver): void {
  d.apply({ type: 'startRound' });
  // Draw until the round ends or the pool is exhausted. decide('endRound') returns
  // non-empty exactly when the condition fires; we poll it after each draw.
  for (let safety = 0; safety < 2_000; safety += 1) {
    const drew = d.apply({ type: 'drawNext' });
    const ended = d.apply({ type: 'endRound' });
    if (ended.length > 0) break;
    if (drew.length === 0) break;
  }
  // Belt-and-braces: force the round to end if it hasn't (pool exhausted with no
  // other condition met).
  if (d.state.currentRound !== null && !d.state.currentRound.ended) {
    d.apply({ type: 'endRound' });
  }
  d.apply({ type: 'applyCut' });
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
