/**
 * @file   packages/application/src/match/startRules.ts
 * @module application/match
 * @brief  How a match starts: the host's Start, a set time, or when every place is taken (01 §7.6).
 *
 * Responsibility: check a set start time (at least the countdown ahead, at most a week).
 *                 A set time is an announcement (D16): the host can always start; with the
 *                 automatic start on, the persistent scheduler (so a restart keeps it) runs
 *                 `auto_start` one countdown before the time, which begins the countdown
 *                 when at least 2 players have joined and otherwise leaves the match waiting
 *                 in the lobby (`tooFewAtStart`). Under "start when full" the last place
 *                 taken begins the countdown. Every start runs the same countdown.
 * Depends on:     @sbr/contracts, ./flow (types), ./ports
 * Used by:        ./engine, ./flow, apps/server (summary)
 * Spec:           docs/spec/01-game-design.md §7.6; docs/spec/05-api-design.md §2.3
 */
import { MAX_START_AHEAD_MS, START_COUNTDOWN_MS } from '@sbr/contracts';

import type { FlowDeps } from './flow.js';
import type { LoadedMatch, StartRule } from './ports.js';

// A set start time must leave room for the countdown and lie within a week.
export function startTimeValid(rule: StartRule | undefined, now: number): boolean {
  if (rule?.kind !== 'at') return true;
  return rule.at >= now + START_COUNTDOWN_MS && rule.at <= now + MAX_START_AHEAD_MS;
}

// Shows the countdown to `startsAt` and schedules the start then; a pending automatic
// start is no longer needed.
export async function scheduleStart(
  deps: FlowDeps,
  matchId: string,
  startsAt: number,
): Promise<void> {
  await deps.scheduler.cancel(matchId, 'auto_start');
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

// Schedules (or drops) the automatic start one countdown before the set time; when that
// moment has passed (the host switched it on late), the scheduler runs it at once.
export async function planAutoStart(deps: FlowDeps, m: LoadedMatch): Promise<void> {
  await deps.scheduler.cancel(m.record.id, 'auto_start');
  const rule = m.record.settings.startRule;
  if (rule.kind !== 'at' || !rule.auto || m.record.startsAt !== null) return;
  const dueAt = rule.at - START_COUNTDOWN_MS;
  await deps.scheduler.schedule({ matchId: m.record.id, kind: 'auto_start', dueAt });
}

// The automatic start is due (one countdown before the set time, or later when switched
// on late): with at least 2 players the countdown begins; with fewer the match waits for
// its host, who sees why.
export async function autoStart(deps: FlowDeps, matchId: string): Promise<void> {
  const m = await deps.runner.current(matchId);
  const rule = m.record.settings.startRule;
  if (m.record.status !== 'lobby' || m.record.startsAt !== null) return;
  if (rule.kind !== 'at' || !rule.auto) return;
  if (m.state.playerOrder.length < 2) {
    // Nothing changes but the time: the screens hear of it and show the notice.
    deps.runner.update(matchId, (x) => x);
    return;
  }
  await scheduleStart(deps, matchId, deps.clock.now() + START_COUNTDOWN_MS);
}

// The automatic start came and found fewer than 2 players: the match waits (D16).
export function tooFewAtStart(m: LoadedMatch, now: number): boolean {
  const rule = m.record.settings.startRule;
  return (
    rule.kind === 'at' &&
    rule.auto &&
    m.record.status === 'lobby' &&
    m.record.startsAt === null &&
    now >= rule.at - START_COUNTDOWN_MS
  );
}
