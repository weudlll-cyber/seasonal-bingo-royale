/**
 * @file   apps/web/src/game/matchRoom.ts
 * @module web/game
 * @brief  A live match's room on the WebSocket: one step per update, record changes (./useLiveMatch).
 *
 * Responsibility: watch the match room. The server sends each step of the match once to the
 *                 room (`events`) and then this screen's part (`own`); the two are applied
 *                 together (@sbr/contracts applyStep) without a request. Only a step that does not follow
 *                 the held seq (a gap), or a part that does not fit, fetches the events after the
 *                 held seq (one delta, no full reload); a (re)connect reloads everything. `match`
 *                 replaces the summary (the host flag kept when a room-wide update leaves it
 *                 out) and the view's draw interval. Following a player (D24) tells the server,
 *                 whose next steps then carry that player's cards (06 §4, §5, §8).
 * Depends on:     @sbr/contracts (applyStep), ../types, ./socket, ./useLiveMatch (types)
 * Used by:        ./useLiveMatch
 * Spec:           docs/spec/06-realtime-architecture.md §1, §4, §5, §8
 */
import { applyStep } from '@sbr/contracts';

import type { LiveOwnFrame, LiveStepFrame } from '../types.js';
import { gameSocket, intent } from './socket.js';
import type { LiveState, MatchSummary } from './useLiveMatch.js';

interface RoomArgs {
  readonly code: string;
  readonly held: { current: LiveState | null };
  readonly load: (full: boolean) => void;
  readonly setLive: (live: LiveState) => void;
}

// Watches the match room: each step is applied when this screen's part of it arrives; a gap
// loads only the new events; a (re)connect loads everything; record changes replace the summary.
export function watchRoom({ code, held, load, setLive }: RoomArgs): () => void {
  const socket = gameSocket();
  let step: LiveStepFrame<MatchSummary> | null = null;
  const watch = (): void => {
    step = null;
    void intent('match.watch', { code });
    load(true);
  };
  const onEvents = (frame: LiveStepFrame<MatchSummary>): void => {
    if (frame.s > (held.current?.seq ?? 0)) step = frame;
  };
  const onOwn = (own: LiveOwnFrame): void => {
    const now = held.current;
    const room = step;
    step = null;
    if (now !== null && own.s <= now.seq) return;
    const next = now === null || room?.s !== own.s ? null : applyStep(now, room, own);
    if (next === null) {
      // A gap (frames that came while a fetch ran): one delta covers it, no full reload (06 §8).
      load(false);
      return;
    }
    held.current = next;
    setLive(next);
  };
  const onMatch = (summary: MatchSummary): void => {
    const now = held.current;
    if (summary.code !== code || now === null) return;
    held.current = {
      ...now,
      match: { ...summary, youHost: summary.youHost ?? now.match.youHost },
      view: { ...now.view, drawIntervalMs: summary.settings.drawIntervalMs },
    };
    setLive(held.current);
  };
  socket.on('connect', watch);
  socket.on('events', onEvents);
  socket.on('own', onOwn);
  socket.on('match', onMatch);
  if (socket.connected) watch();
  else load(true);
  return () => {
    socket.off('connect', watch);
    socket.off('events', onEvents);
    socket.off('own', onOwn);
    socket.off('match', onMatch);
    void intent('match.unwatch', { code });
  };
}

// The player a watching screen follows, or the top again (null); its next steps show them.
export function followInRoom(code: string, name: string | null): void {
  void intent('match.follow', { code, follow: name });
}
