/**
 * @file   packages/application/src/match/startRules.ts
 * @module application/match
 * @brief  How a match starts: the host's Start, a set time, or when every place is taken (01 §7.6).
 *
 * Responsibility: check a set start time (at least a minute ahead, at most a week). A set
 *                 time is an announcement (D16): the host can always start; with the
 *                 automatic start on, the persistent scheduler runs `auto_start` at the
 *                 time, which begins the countdown with the ruleset's minimum
 *                 (`minPlayersOf`) and otherwise leaves the match waiting (`tooFewAtStart`).
 *                 Under "start when full" the last place taken begins the countdown. While
 *                 maintenance is on neither starts by itself: the start is held and checked
 *                 again every 5 s (D22). Every start runs the same countdown.
 * Depends on:     @sbr/contracts, ./flow (types), ./ports
 * Used by:        ./engine, ./flow, apps/server (summary), ../index
 * Spec:           docs/spec/01-game-design.md §7.6 (D16, D22); docs/spec/05-api-design.md §2.3
 */
import { MAX_START_AHEAD_MS, MIN_START_AHEAD_MS, START_COUNTDOWN_MS } from '@sbr/contracts';

import type { FlowDeps } from './flow.js';
import type { LoadedMatch, StartRule } from './ports.js';

// A set start time must leave room for the countdown and lie within a week.
export function startTimeValid(rule: StartRule | undefined, now: number): boolean {
  if (rule?.kind !== 'at') return true;
  return rule.at >= now + MIN_START_AHEAD_MS && rule.at <= now + MAX_START_AHEAD_MS;
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

// How often a start held by maintenance looks again whether maintenance is off (D22).
const HELD_START_RETRY_MS = 5_000;

// After a join: under "start when full" the last place begins the countdown; while
// maintenance is on the start is held (D22).
export async function startIfFull(deps: FlowDeps, m: LoadedMatch): Promise<void> {
  if (!fullAndWaiting(m)) return;
  if (await heldByMaintenance(deps, m.record.id)) return;
  await scheduleStart(deps, m.record.id, deps.clock.now() + START_COUNTDOWN_MS);
}

function fullAndWaiting(m: LoadedMatch): boolean {
  const full = m.state.playerOrder.length >= m.record.maxPlayers;
  return m.record.settings.startRule.kind === 'whenFull' && full && m.record.startsAt === null;
}

// D22: while maintenance is on nothing starts by itself. The start waits in the lobby
// and is checked again through the persistent scheduler, so it runs (or start-when-full
// is checked again) soon after maintenance is turned off, also after a restart.
async function heldByMaintenance(deps: FlowDeps, matchId: string): Promise<boolean> {
  if (deps.maintenance() === null) return false;
  await deps.scheduler.cancel(matchId, 'auto_start');
  const dueAt = deps.clock.now() + HELD_START_RETRY_MS;
  await deps.scheduler.schedule({ matchId, kind: 'auto_start', dueAt });
  return true;
}

// Schedules (or drops) the automatic start at the set time; when that has passed (the host
// switched it on late), the scheduler runs it at once.
export async function planAutoStart(deps: FlowDeps, m: LoadedMatch): Promise<void> {
  await deps.scheduler.cancel(m.record.id, 'auto_start');
  const rule = m.record.settings.startRule;
  if (rule.kind !== 'at' || !rule.auto || m.record.startsAt !== null) return;
  await deps.scheduler.schedule({ matchId: m.record.id, kind: 'auto_start', dueAt: rule.at });
}

// Players a match needs to start: the frozen ruleset's lobby.minPlayers (default 2, 01 §7.6).
export function minPlayersOf(m: LoadedMatch): number {
  return m.record.ruleset.lobby.minPlayers;
}

// The automatic start is due (at the set time, or later when switched on late): with
// enough players (minPlayersOf) the countdown begins; with fewer the match waits for its
// host, who sees why. A start held by maintenance comes here too (D22).
export async function autoStart(deps: FlowDeps, matchId: string): Promise<void> {
  const m = await deps.runner.current(matchId);
  const rule = m.record.settings.startRule;
  if (m.record.status !== 'lobby' || m.record.startsAt !== null) return;
  if (rule.kind === 'whenFull') return startIfFull(deps, m);
  if (rule.kind !== 'at' || !rule.auto) return;
  if (await heldByMaintenance(deps, matchId)) return;
  if (m.state.playerOrder.length < minPlayersOf(m)) {
    // Nothing changes but the time: the screens hear of it and show the notice.
    deps.runner.update(matchId, (x) => x);
    return;
  }
  await scheduleStart(deps, matchId, deps.clock.now() + START_COUNTDOWN_MS);
}

// The automatic start came and found too few players: the match waits (D16).
export function tooFewAtStart(m: LoadedMatch, now: number): boolean {
  const rule = m.record.settings.startRule;
  return (
    rule.kind === 'at' &&
    rule.auto &&
    m.record.status === 'lobby' &&
    m.record.startsAt === null &&
    now >= rule.at
  );
}
