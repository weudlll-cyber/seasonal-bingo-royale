/**
 * @file   packages/application/src/match/startRules.ts
 * @module application/match
 * @brief  How a match starts: the host's Start, a set time, or when every place is taken (01 §7.6).
 *
 * Responsibility: check a set start time (at least the countdown ahead, at most a week);
 *                 schedule the start at that time through the persistent scheduler (so a
 *                 restart keeps it) and show the time as the countdown target; begin the
 *                 countdown when the last place is taken under "start when full"; and the
 *                 common countdown of the host's Start. At the start itself, a match with
 *                 fewer than 2 players is stopped with a plain reason (the spec is silent;
 *                 the simplest rule, see the morning sheet).
 * Depends on:     @sbr/contracts, ./flow (types), ./ports
 * Used by:        ./engine, ./flow
 * Spec:           docs/spec/01-game-design.md §7.6; docs/spec/05-api-design.md §3
 */
import { MAX_START_AHEAD_MS, START_COUNTDOWN_MS } from '@sbr/contracts';

import type { FlowDeps } from './flow.js';
import type { LoadedMatch, StartRule } from './ports.js';

export const NOT_ENOUGH_AT_START = 'Not enough players at the start time';

// A set start time must leave room for the countdown and lie within a week.
export function startTimeValid(rule: StartRule | undefined, now: number): boolean {
  if (rule?.kind !== 'at') return true;
  return rule.at >= now + START_COUNTDOWN_MS && rule.at <= now + MAX_START_AHEAD_MS;
}

// Shows the countdown to `startsAt` and schedules the start then.
export async function scheduleStart(
  deps: FlowDeps,
  matchId: string,
  startsAt: number,
): Promise<void> {
  await deps.store.setStatus(matchId, 'lobby', { startsAt });
  deps.runner.update(matchId, (x) => ({ ...x, record: { ...x.record, startsAt } }));
  await deps.scheduler.schedule({ matchId, kind: 'start_match', dueAt: startsAt });
}

// After a join: under "start when full" the last place begins the countdown.
export async function startIfFull(deps: FlowDeps, m: LoadedMatch): Promise<void> {
  const full = m.state.playerOrder.length >= m.record.maxPlayers;
  if (m.record.settings.startRule.kind !== 'whenFull' || !full || m.record.startsAt !== null)
    return;
  await scheduleStart(deps, m.record.id, deps.clock.now() + START_COUNTDOWN_MS);
}

// At the start: too few players (a set time can come with an empty lobby) stops the match.
export function tooFewToStart(m: LoadedMatch): boolean {
  return m.state.playerOrder.length < 2;
}
