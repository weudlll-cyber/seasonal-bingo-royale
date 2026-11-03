/**
 * @file   apps/web/src/game/liveView.ts
 * @module web/game
 * @brief  The live view a screen holds: the state fetch's answer merged into it (./useLiveMatch).
 *
 * Responsibility: append the events after the held seq to the held view (a delta keeps the
 *                 player list and the cut facts it leaves out; events already appended from
 *                 frames are not repeated); what a watching screen asks for (D24: the player it
 *                 follows and the cards it holds); the watched card layouts put into the held
 *                 round start, so the fold shows their marks. Display only; the server decides.
 * Depends on:     ../types, ./useLiveMatch (types)
 * Used by:        ./useLiveMatch
 * Spec:           docs/spec/06-realtime-architecture.md §4, §5, §8; docs/spec/05-api-design.md §2.3
 */
import type { Card, CompactCard, DomainEventLike, QuickTestResult } from '../types.js';
import type { LiveState } from './useLiveMatch.js';

// A delta (since > 0) leaves out the player list unless a join, a round start or the
// finish is among its events; the client keeps the list it holds.
export interface StateResponse extends Omit<LiveState, 'view'> {
  readonly since: number;
  readonly view: Omit<QuickTestResult, 'players' | 'cuts'> &
    Partial<Pick<QuickTestResult, 'players' | 'cuts'>>;
}

// What a watching screen asks for (D24): the player it follows and, for the current round,
// the players whose cards it holds already.
export function watchParams(held: LiveState | null, follow: string | null): string {
  if (held?.view.watch === undefined) return '';
  const start = lastRoundStart(held.view.events);
  const known =
    start === undefined
      ? ''
      : `&known=${String(start.roundIndex)}:${Object.keys(start.cardsByPlayer).map(encodeURIComponent).join(',')}`;
  return `${follow === null ? '' : `&follow=${encodeURIComponent(follow)}`}${known}`;
}

// A compact watched card (one number per cell) as the card the screens draw.
function fullCard(c: CompactCard): Card {
  const cells = c.cells.map((v): Card['cells'][number] => {
    if (v === 0) return { kind: 'free' };
    return v > 100 ? { kind: 'symbol', value: v } : { kind: 'number', value: v };
  });
  return { cells, seasonCells: c.seasonCells };
}

type RoundStart = Extract<DomainEventLike, { type: 'roundStarted' }>;

function lastRoundStart(events: readonly DomainEventLike[]): RoundStart | undefined {
  return events.findLast((e): e is RoundStart => e.type === 'roundStarted');
}

// The watched card layouts go into the held start of their round; the fold then shows the
// round's marks on them (the public cellMarked events).
function withWatchedCards(view: QuickTestResult): QuickTestResult {
  const sent = Object.entries(view.watch?.cards ?? {});
  const start = lastRoundStart(view.events);
  if (start === undefined || sent.length === 0) return view;
  const cards = Object.fromEntries(sent.map(([name, list]) => [name, list.map(fullCard)]));
  const patched = { ...start, cardsByPlayer: { ...start.cardsByPlayer, ...cards } };
  return { ...view, events: view.events.map((e) => (e === start ? patched : e)) };
}

// Appends the new events to the held view; everything else comes fresh from the server.
// Frames appended while the fetch ran are already held: those events are not repeated.
export function merge(held: LiveState | null, r: StateResponse): LiveState {
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
