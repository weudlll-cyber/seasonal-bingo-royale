/**
 * @file   apps/server/src/view/roundRecap.ts
 * @module server/view
 * @brief  Builds the recap of a royale round from the match's own events (D20).
 *
 * Responsibility: replay the events with the domain's evolve and, for one round, collect:
 *                 the points each active player scored in it (their total at the round's
 *                 end less their total at its start, so multipliers and score carry are the
 *                 domain's), the standings place before and after it (among the round's
 *                 players, ties broken as the cut breaks them, 01 §8.4), Season Complete, the numbers
 *                 drawn, the cut that follows (out, shield saves, players left) and each
 *                 player's own taps: the time from a number's draw to the tap, from the
 *                 events' stored times, for the marks stored as the player's own (`manualTaps`,
 *                 from sbr.marks; bots and auto-marks mark on the draw and are not taps).
 *                 Items with no content are left out. Pure: the same events give the same
 *                 recap, also after a restart. Fun only: nothing here changes a score.
 * Depends on:     @sbr/contracts (types), @sbr/domain
 * Used by:        ./liveViews, ../dev/quicktest, ./roundRecap.test
 * Spec:           docs/spec/01-game-design.md §7 (D20); docs/spec/05-api-design.md §2.3a
 */
import type { RecapScorer, RoundRecap } from '@sbr/contracts';
import {
  byTieBreak,
  candidateOf,
  createInitialMatchState,
  evolve,
  type CutApplied,
  type DomainEvent,
  type MatchState,
  type TieBreakScore,
} from '@sbr/domain';

// An event and, in a live match, when it was stored (epoch ms).
export interface TimedEvent {
  readonly event: DomainEvent;
  readonly at?: number;
}

interface RecapInput {
  readonly events: readonly TimedEvent[];
  readonly roundIndex: number;
  // Internal player id → the name the screens show.
  readonly idMap: ReadonlyMap<string, string>;
  readonly speedWindowMs: number;
  // The player's own taps in the round, as `${playerId}:${cardIndex}:${cell}`.
  readonly manualTaps?: ReadonlySet<string>;
}

const TOP = 3;
const CUT_NAMES = 8;
const MIN_TAPS = 5;
// Never used for a player of the round (every one has a score); keeps the sort total.
const NO_SCORE: TieBreakScore = {
  points: 0,
  patterns: 0,
  seasonsActivated: 0,
  lastScoringDraw: null,
  joinedAt: Number.POSITIVE_INFINITY,
};

// What one pass over the events collects about the round.
interface RoundFacts {
  state: MatchState;
  active: readonly string[];
  start: ReadonlyMap<string, TieBreakScore>;
  end: ReadonlyMap<string, TieBreakScore> | null;
  drawTimes: number[];
  draws: number;
  taps: Map<string, number[]>;
  seasonComplete: string[];
  cut: CutApplied | null;
  inRound: boolean;
}

// Null until the round has ended.
export function buildRoundRecap(input: RecapInput): RoundRecap | null {
  const facts = collect(input);
  if (facts.end === null) return null;
  const end = facts.end;
  const name = (id: string): string => input.idMap.get(id) ?? id;
  const order = facts.state.playerOrder;
  const pointsIn = (scores: ReadonlyMap<string, TieBreakScore>, id: string): number =>
    scores.get(id)?.points ?? 0;
  const scored = new Map(
    facts.active.map((id) => [id, pointsIn(end, id) - pointsIn(facts.start, id)]),
  );
  const after = places(facts.active, end);
  const before = places(facts.active, facts.start);
  const top: RecapScorer[] = topScorers(facts.active, scored, after).map((id) => ({
    name: name(id),
    points: scored.get(id) ?? 0,
  }));
  const climber = biggestClimber(facts.active, before, after, scored);
  const fastest = fastestTapper(facts.taps, order);
  const cut = cutItem(facts.cut, name);
  return {
    roundIndex: input.roundIndex,
    ...(top.length > 0 ? { top } : {}),
    ...(climber === null
      ? {}
      : {
          climber: {
            name: name(climber),
            from: before.get(climber) ?? 0,
            to: after.get(climber) ?? 0,
          },
        }),
    ...(cut === null ? {} : { cut }),
    ...(facts.seasonComplete.length > 0 ? { seasonComplete: facts.seasonComplete.map(name) } : {}),
    ...(fastest === null
      ? {}
      : { fastest: { name: name(fastest.id), averageMs: fastest.averageMs, taps: fastest.taps } }),
    facts: {
      numbersDrawn: facts.draws,
      playersLeft: facts.cut === null ? facts.active.length : facts.cut.survivors.length,
    },
  };
}

// The cut after the round, when it put someone out or a shield saved someone.
function cutItem(
  cut: CutApplied | null,
  name: (id: string) => string,
): NonNullable<RoundRecap['cut']> | null {
  if (cut === null || (cut.eliminated.length === 0 && cut.shieldSaves.length === 0)) return null;
  return {
    outCount: cut.eliminated.length,
    out: cut.eliminated.slice(0, CUT_NAMES).map(name),
    saved: cut.shieldSaves.map(name),
  };
}

function collect(input: RecapInput): RoundFacts {
  const facts: RoundFacts = {
    state: createInitialMatchState(),
    active: [],
    start: new Map(),
    end: null,
    drawTimes: [],
    draws: 0,
    taps: new Map(),
    seasonComplete: [],
    cut: null,
    inRound: false,
  };
  for (const timed of input.events) {
    // A tap's card cell is read before the mark changes the state.
    if (facts.inRound && timed.event.type === 'cellMarked') noteTap(facts, timed, input);
    facts.state = evolve(facts.state, timed.event);
    note(facts, timed, input.roundIndex);
  }
  return facts;
}

// Everything but taps, after the event has been folded into the state.
function note(facts: RoundFacts, { event, at }: TimedEvent, roundIndex: number): void {
  if (event.type === 'roundStarted' || event.type === 'stageStarted') facts.inRound = false;
  if (event.type === 'roundStarted' && event.roundIndex === roundIndex) {
    facts.inRound = true;
    facts.active = Object.keys(event.cardsByPlayer);
    facts.start = totals(facts.state, facts.active);
    return;
  }
  if (facts.inRound) noteInRound(facts, event, at);
}

// The round's draws, Season Complete, its end and the cut after it.
function noteInRound(facts: RoundFacts, event: DomainEvent, at: number | undefined): void {
  switch (event.type) {
    case 'drawMade':
      facts.draws += 1;
      if (at !== undefined) facts.drawTimes[event.drawIndex] = at;
      return;
    case 'seasonCompleteFired':
      facts.seasonComplete.push(event.accountId);
      return;
    case 'roundEnded':
      facts.end = totals(facts.state, facts.active);
      return;
    case 'cutApplied':
      if (facts.end !== null) facts.cut = event;
      return;
    default:
      return;
  }
}

// A tap of the player's own inside the speed window: the time since its number was drawn.
function noteTap(facts: RoundFacts, { event, at }: TimedEvent, input: RecapInput): void {
  if (event.type !== 'cellMarked' || at === undefined) return;
  const key = `${event.accountId}:${String(event.cardIndex)}:${String(event.cellIndex)}`;
  if (input.manualTaps?.has(key) !== true) return;
  const drawnAt = drawTimeOf(facts, event);
  if (drawnAt === null) return;
  const ms = at - drawnAt;
  if (ms < 0 || ms > input.speedWindowMs) return;
  facts.taps.set(event.accountId, [...(facts.taps.get(event.accountId) ?? []), ms]);
}

// When the number on the marked cell was drawn, if the events carried that time.
function drawTimeOf(
  facts: RoundFacts,
  event: Extract<DomainEvent, { type: 'cellMarked' }>,
): number | null {
  const round = facts.state.currentRound;
  if (round === null) return null;
  const cell = round.cards[event.accountId]?.[event.cardIndex]?.card.cells[event.cellIndex];
  if (cell === undefined || cell.kind === 'free') return null;
  return facts.drawTimes[round.draws.indexOf(cell.value)] ?? null;
}

// Each player's standing at one moment: the fields of the 01 §8.4 tie-break chain.
function totals(state: MatchState, ids: readonly string[]): ReadonlyMap<string, TieBreakScore> {
  return new Map(ids.map((id) => [id, candidateOf(state, id)]));
}

// Standings places (1-based), ties broken as the cut breaks them (byTieBreak, 01 §8.4).
function places(
  ids: readonly string[],
  scores: ReadonlyMap<string, TieBreakScore>,
): ReadonlyMap<string, number> {
  const score = (id: string): TieBreakScore => scores.get(id) ?? NO_SCORE;
  const ranked = [...ids].sort((a, b) => byTieBreak(score(a), score(b)));
  return new Map(ranked.map((id, i) => [id, i + 1]));
}

// Most points in the round first, ties by the place after it; only players who scored.
function topScorers(
  ids: readonly string[],
  scored: ReadonlyMap<string, number>,
  after: ReadonlyMap<string, number>,
): readonly string[] {
  return ids
    .filter((id) => (scored.get(id) ?? 0) > 0)
    .sort(
      (a, b) =>
        (scored.get(b) ?? 0) - (scored.get(a) ?? 0) || (after.get(a) ?? 0) - (after.get(b) ?? 0),
    )
    .slice(0, TOP);
}

// Most places gained; ties by points scored in the round, then by the place after it.
function biggestClimber(
  ids: readonly string[],
  before: ReadonlyMap<string, number>,
  after: ReadonlyMap<string, number>,
  scored: ReadonlyMap<string, number>,
): string | null {
  const gain = (id: string): number => (before.get(id) ?? 0) - (after.get(id) ?? 0);
  const climbers = ids
    .filter((id) => gain(id) > 0)
    .sort(
      (a, b) =>
        gain(b) - gain(a) ||
        (scored.get(b) ?? 0) - (scored.get(a) ?? 0) ||
        (after.get(a) ?? 0) - (after.get(b) ?? 0),
    );
  return climbers[0] ?? null;
}

// Lowest average over at least MIN_TAPS taps; ties by more taps, then by join order.
function fastestTapper(
  taps: ReadonlyMap<string, readonly number[]>,
  order: readonly string[],
): (Omit<NonNullable<RoundRecap['fastest']>, 'name'> & { readonly id: string }) | null {
  const qualified = [...taps]
    .filter(([, times]) => times.length >= MIN_TAPS)
    .map(([id, times]) => ({
      id,
      taps: times.length,
      averageMs: Math.round(times.reduce((sum, t) => sum + t, 0) / times.length),
    }))
    .sort(
      (a, b) =>
        a.averageMs - b.averageMs || b.taps - a.taps || order.indexOf(a.id) - order.indexOf(b.id),
    );
  return qualified[0] ?? null;
}
