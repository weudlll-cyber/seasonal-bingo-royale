/**
 * @file   packages/application/src/match/awaySummary.ts
 * @module application/match
 * @brief  Builds "While you were away" from a match's event log (01 §11, 06 §6).
 *
 * Responsibility: replay the events with the domain's evolve and, for the events after the
 *                 player's last seen seq, count the draws, the player's own marks, patterns,
 *                 season activations and Season Complete, the cuts the player survived or
 *                 went out in, and the end of the match; the rank among
 *                 the players still in (01 §8.4 tie-break) and the points before and now. Null
 *                 when nothing new happened or the player is not in the match. Pure.
 * Depends on:     @sbr/contracts (types), @sbr/domain
 * Used by:        ../index
 * Spec:           docs/spec/01-game-design.md §11; docs/spec/06-realtime-architecture.md §6
 */
import type { AwaySummary, Season } from '@sbr/contracts';
import {
  byTieBreak,
  candidateOf,
  createInitialMatchState,
  evolve,
  type DomainEvent,
  type MatchState,
} from '@sbr/domain';

interface AwayInput {
  // The match's events in seq order, from the first.
  readonly events: readonly { readonly seq: number; readonly event: DomainEvent }[];
  readonly lastSeenSeq: number;
  readonly playerId: string;
}

interface Tally {
  draws: number;
  marks: number;
  patterns: number;
  seasons: Season[];
  seasonComplete: boolean;
  cutsSurvived: number;
  eliminated: boolean;
  finished: boolean;
  finalPlace: number | null;
}

const emptyTally = (): Tally => ({
  draws: 0,
  marks: 0,
  patterns: 0,
  seasons: [],
  seasonComplete: false,
  cutsSurvived: 0,
  eliminated: false,
  finished: false,
  finalPlace: null,
});

function playersIn(state: MatchState): readonly string[] {
  return state.playerOrder.filter((id) => state.players[id]?.eliminatedAtRound === null);
}

// Place among the players still in (1-based); null when out or before the first round.
function rankOf(state: MatchState, me: string): number | null {
  const p = state.players[me];
  if (p === undefined || p.eliminatedAtRound !== null || state.currentRound === null) return null;
  const ranked = [...playersIn(state)].sort((a, b) =>
    byTieBreak(candidateOf(state, a), candidateOf(state, b)),
  );
  return ranked.indexOf(me) + 1;
}

// The match-wide facts of one event after the last seen seq: draws, cuts, the end.
function tallyMatch(t: Tally, e: DomainEvent, me: string): void {
  if (e.type === 'drawMade') t.draws += 1;
  else if (e.type === 'cutApplied') {
    if (e.survivors.includes(me)) t.cutsSurvived += 1;
    if (e.eliminated.includes(me)) t.eliminated = true;
  } else if (e.type === 'matchFinished') {
    t.finished = true;
    t.finalPlace = e.placement.find((p) => p.accountId === me)?.place ?? null;
  } else if (e.type === 'matchAborted') t.finished = true;
}

// The player's own facts: marks, patterns, seasons, Season Complete.
function tallyOwn(t: Tally, e: DomainEvent, me: string): void {
  if (!('accountId' in e) || e.accountId !== me) return;
  if (e.type === 'cellMarked') t.marks += 1;
  else if (e.type === 'patternScored') t.patterns += 1;
  else if (e.type === 'seasonActivated') t.seasons.push(e.season);
  else if (e.type === 'seasonCompleteFired') t.seasonComplete = true;
}

const newsIn = (t: Tally): boolean =>
  t.draws > 0 || t.cutsSurvived > 0 || t.eliminated || t.finished;

interface BetweenInput {
  // The match before the first unseen event and now, and the events in between.
  readonly before: MatchState;
  readonly after: MatchState;
  readonly tail: readonly { readonly seq: number; readonly event: DomainEvent }[];
  readonly lastSeenSeq: number;
  readonly playerId: string;
}

// The summary from the two states and the events between: a server replays the state before
// once for every player who last looked at the same seq (200 players after a day, 12 §5).
export function summaryBetween(input: BetweenInput): AwaySummary | null {
  const { before, after, tail, lastSeenSeq, playerId } = input;
  const t = emptyTally();
  for (const { event } of tail) {
    tallyMatch(t, event, playerId);
    tallyOwn(t, event, playerId);
  }
  const last = tail.at(-1);
  const me = after.players[playerId];
  if (last === undefined || me === undefined || !newsIn(t)) return null;
  return {
    fromSeq: lastSeenSeq,
    toSeq: last.seq,
    ...t,
    pointsBefore: before.players[playerId]?.points ?? 0,
    pointsNow: me.points,
    rankBefore: rankOf(before, playerId),
    rankNow: rankOf(after, playerId),
    playersIn: playersIn(after).length,
  };
}

// The summary from the whole log, replayed here.
export function buildAwaySummary({ events, lastSeenSeq, playerId }: AwayInput): AwaySummary | null {
  let state = createInitialMatchState();
  let before: MatchState | null = null;
  for (const { seq, event } of events) {
    if (seq > lastSeenSeq) before ??= state;
    state = evolve(state, event);
  }
  if (before === null) return null;
  const tail = events.filter((e) => e.seq > lastSeenSeq);
  return summaryBetween({ before, after: state, tail, lastSeenSeq, playerId });
}
