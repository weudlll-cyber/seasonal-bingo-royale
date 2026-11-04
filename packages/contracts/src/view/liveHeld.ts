/**
 * @file   packages/contracts/src/view/liveHeld.ts
 * @module contracts/view
 * @brief  How a screen keeps a live match: the state answer merged, a step's frames applied (06 §8).
 *
 * Responsibility: the reference rules of the live protocol, shared by the player client and the
 *                 server's equivalence test (apps/server/test/liveSteps.integration.test.ts).
 *                 `mergeAnswer`: a state answer's events are appended to the held view (a delta
 *                 keeps the player list and cut facts it leaves out; events already held are not
 *                 repeated), everything else comes fresh. `applyStep`: the room frame and the
 *                 screen's own frame of one step together — the events appended (the viewer's own
 *                 cards put into its round starts; every held round start keeps only the viewer's
 *                 own cards before the current watched cards go into the newest), the summary (the
 *                 host flag kept), the players still in in order, the recap or its end, and the
 *                 stage baselines, cut facts and player list (the viewer's row marked and given
 *                 its card) when the step brings them, the viewer's effect timeline replaced after
 *                 the entry the frame starts at, the watched cards taken or dropped (D24); a step
 *                 that does not follow the held seq, or a timeline that does not fit, answers null
 *                 and the screen fetches. Applied after every step, the held view equals a full
 *                 state answer at the same seq. `withWatchedCards` puts the watched card layouts
 *                 into the newest round start, so the fold shows their marks. Display data only;
 *                 the server decides everything.
 * Depends on:     ./clientView, ./liveFrames
 * Used by:        apps/web (game/useLiveMatch, game/matchRoom, game/liveView),
 *                 apps/server/test/liveSteps.integration.test.ts
 * Spec:           docs/spec/06-realtime-architecture.md §4, §8; docs/spec/05-api-design.md §2.3
 */
import type { Card, CompactCard, DomainEventLike, QuickTestResult } from './clientView.js';
import type { LiveOwnFrame, LiveStepFrame } from './liveFrames.js';

// What a screen holds: the summary (`youHost` known from the screen's own answers), the seq,
// who the viewer plays as, the view.
export interface LiveHeld<Summary> {
  readonly match: Summary;
  readonly seq: number;
  readonly me: string | null;
  readonly view: QuickTestResult;
}

// A state answer; a delta (since > 0) leaves out the player list unless a join, a round start
// or the finish is among its events, and the cut facts unless a cut is.
export interface LiveAnswer<Summary> extends Omit<LiveHeld<Summary>, 'view'> {
  readonly since: number;
  readonly view: Omit<QuickTestResult, 'players' | 'cuts'> &
    Partial<Pick<QuickTestResult, 'players' | 'cuts'>>;
}

type HostKnown = { readonly youHost: boolean | null };
type RoundStart = Extract<DomainEventLike, { type: 'roundStarted' }>;

export function lastRoundStart(events: readonly DomainEventLike[]): RoundStart | undefined {
  return events.findLast((e): e is RoundStart => e.type === 'roundStarted');
}

// A compact watched card (one number per cell) as the card the screens draw.
function fullCard(c: CompactCard): Card {
  const cells = c.cells.map((v): Card['cells'][number] => {
    if (v === 0) return { kind: 'free' };
    return v > 100 ? { kind: 'symbol', value: v } : { kind: 'number', value: v };
  });
  return { cells, seasonCells: c.seasonCells };
}

export function withWatchedCards(view: QuickTestResult): QuickTestResult {
  const sent = Object.entries(view.watch?.cards ?? {});
  const start = lastRoundStart(view.events);
  if (start === undefined || sent.length === 0) return view;
  const cards = Object.fromEntries(sent.map(([name, list]) => [name, list.map(fullCard)]));
  const patched = { ...start, cardsByPlayer: { ...start.cardsByPlayer, ...cards } };
  return { ...view, events: view.events.map((e) => (e === start ? patched : e)) };
}

export function mergeAnswer<S>(held: LiveHeld<S> | null, r: LiveAnswer<S>): LiveHeld<S> {
  const players = r.view.players ?? held?.view.players ?? [];
  const cuts = r.view.cuts ?? held?.view.cuts ?? [];
  if (held === null || r.since === 0) {
    const view = withWatchedCards({ ...r.view, players, cuts });
    return { match: r.match, seq: r.seq, me: r.me, view };
  }
  const fresh = r.view.events.slice(Math.max(0, held.seq - r.since));
  const events = [...held.view.events, ...fresh];
  const view = withWatchedCards({ ...r.view, players, cuts, events });
  return { match: r.match, seq: Math.max(r.seq, held.seq), me: r.me, view };
}

// A round start with only the viewer's own cards (none for a viewer who does not play).
function ownOnly(e: RoundStart, me: string | null): RoundStart {
  const own = me === null ? undefined : e.cardsByPlayer[me];
  return { ...e, cardsByPlayer: own === undefined || me === null ? {} : { [me]: own } };
}

function stepEvents<S>(held: LiveHeld<S>, step: LiveStepFrame, own: LiveOwnFrame) {
  const fresh = step.events.map(({ s, event }) => {
    const cards = own.cards?.[String(s)];
    return event.type === 'roundStarted' && cards !== undefined && own.me !== null
      ? { ...event, cardsByPlayer: { [own.me]: cards } }
      : event;
  });
  // The watched cards of earlier steps leave the round starts; the current ones come back in.
  const before = held.view.events.map((e) => (e.type === 'roundStarted' ? ownOnly(e, own.me) : e));
  return [...before, ...fresh];
}

// The viewer's effect timeline, or null when the frame starts after what is held.
function timeline<S>(held: LiveHeld<S>, own: LiveOwnFrame): QuickTestResult['ownerStatus'] | null {
  if (own.me === null) return {};
  const had = held.view.ownerStatus[own.me] ?? [];
  if (own.status === undefined) return { [own.me]: had };
  if (own.status.from > had.length) return null;
  return { [own.me]: [...had.slice(0, own.status.from), ...own.status.entries] };
}

function stepPlayers<S>(held: LiveHeld<S>, step: LiveStepFrame, own: LiveOwnFrame) {
  if (step.view.players === undefined) return held.view.players;
  return step.view.players.map((p) =>
    p.accountId === own.me ? { ...p, isOwner: true, card: own.card ?? p.card } : p,
  );
}

export function applyStep<S extends HostKnown>(
  held: LiveHeld<S>,
  step: LiveStepFrame<S>,
  own: LiveOwnFrame,
): LiveHeld<S> | null {
  if (step.since !== held.seq || own.s !== step.s) return null;
  const ownerStatus = timeline(held, own);
  if (ownerStatus === null) return null;
  const { recaps: _recaps, watch: _watch, ...kept } = held.view;
  const v = step.view;
  const view: QuickTestResult = {
    ...kept,
    ...(v.recaps === null ? {} : { recaps: v.recaps }),
    ...(own.watch === null ? {} : { watch: own.watch }),
    ...(v.stagePoints === undefined ? {} : { stagePoints: v.stagePoints }),
    ...(v.cuts === undefined ? {} : { cuts: v.cuts }),
    rankedIn: v.rankedIn,
    players: stepPlayers(held, step, own),
    ownerAccountIds: own.me === null ? [] : [own.me],
    ownerStatus,
    events: stepEvents(held, step, own),
  };
  return {
    match: { ...step.match, youHost: held.match.youHost },
    seq: step.s,
    me: own.me,
    view: withWatchedCards(view),
  };
}
