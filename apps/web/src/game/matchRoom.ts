/**
 * @file   apps/web/src/game/matchRoom.ts
 * @module web/game
 * @brief  A live match's room on the WebSocket: frames appended or fetched, record changes (./useLiveMatch).
 *
 * Responsibility: watch the match room: a frame that follows the held seq and holds only
 *                 other players' taps, patterns, prizes or window closes is appended; any other
 *                 frame, a gap included, fetches the events after the held seq (one delta, no
 *                 full reload); a (re)connect reloads everything; `match` replaces the summary
 *                 (the host flag kept when a room-wide update leaves it out) (06 §4, §5, §8).
 * Depends on:     ../types, ./socket, ./useLiveMatch (types)
 * Used by:        ./useLiveMatch
 * Spec:           docs/spec/06-realtime-architecture.md §1, §4, §5, §8
 */
import type { DomainEventLike } from '../types.js';
import { gameSocket, intent } from './socket.js';
import type { LiveState, MatchSummary } from './useLiveMatch.js';

interface RoomArgs {
  readonly code: string;
  readonly held: { current: LiveState | null };
  readonly load: (full: boolean) => void;
  readonly setLive: (live: LiveState) => void;
}

// Events a screen appends as they come, without fetching: other players' taps, patterns
// and prizes, and window closes (frames carry them renamed, as the state endpoint does).
// Anything else — a draw, the viewer's own events, rounds, stages, cuts, the end — changes
// what the server computes for this screen (effects, baselines, places), so it fetches.
const APPENDABLE = new Set([
  'cellMarked',
  'patternScored',
  'classicPrizeAwarded',
  'speedWindowClosed',
]);

interface Frame {
  readonly s: number;
  readonly events: readonly { readonly s: number; readonly event: DomainEventLike }[];
}

// A frame is appended unless it names the viewer, or a player this screen watches (their
// "1 to go" comes with a fetch, D24).
function appendable(frame: Frame, now: LiveState): boolean {
  const watched = new Set(now.view.watch === undefined ? [] : Object.keys(now.view.watch.oneToGo));
  return frame.events.every(
    ({ event }) =>
      APPENDABLE.has(event.type) &&
      !('accountId' in event && (event.accountId === now.me || watched.has(event.accountId))),
  );
}

// Watches the match room: a frame that follows the held seq is appended (other players'
// taps); any other frame, a gap included, loads only the new events; a (re)connect loads
// everything; record changes replace the summary.
export function watchRoom({ code, held, load, setLive }: RoomArgs): () => void {
  const socket = gameSocket();
  const watch = (): void => {
    void intent('match.watch', { code });
    load(true);
  };
  const onEvents = (frame: Frame): void => {
    const first = frame.events[0]?.s ?? frame.s;
    const now = held.current;
    const heldSeq = now?.seq ?? 0;
    if (frame.s <= heldSeq) return;
    if (now !== null && first === heldSeq + 1 && appendable(frame, now)) {
      const events = [...now.view.events, ...frame.events.map((e) => e.event)];
      held.current = { ...now, seq: frame.s, view: { ...now.view, events } };
      setLive(held.current);
      return;
    }
    // Everything else, a gap included (frames that came while a fetch ran), fetches the
    // events after the held seq once the running fetch is done: one delta covers the gap,
    // no full reload (06 §8).
    load(false);
  };
  const onMatch = (summary: MatchSummary): void => {
    if (summary.code !== code || held.current === null) return;
    held.current = {
      ...held.current,
      match: { ...summary, youHost: summary.youHost ?? held.current.match.youHost },
    };
    setLive(held.current);
  };
  socket.on('connect', watch);
  socket.on('events', onEvents);
  socket.on('match', onMatch);
  if (socket.connected) watch();
  else load(true);
  return () => {
    socket.off('connect', watch);
    socket.off('events', onEvents);
    socket.off('match', onMatch);
    void intent('match.unwatch', { code });
  };
}
