/**
 * @file   apps/web/src/game/useLiveMatch.ts
 * @module web/game
 * @brief  A live match on screen: the server's view, kept current over the WebSocket.
 *
 * Responsibility: load GET /matches/:code/state, watch the match room, and on every event
 *                 frame fetch only the events after the seq already held (`since`) and
 *                 append them; a frame that does not follow the held seq (a gap) or a
 *                 reconnect reloads everything, so nothing is lost and nothing doubled (06
 *                 §4, §5). Record changes (status, start time, draw control) arrive as
 *                 `match`. Fetches never overlap. The view has the Quick Test's shape, so the
 *                 screens fold it with the same playback logic.
 * Depends on:     react, ../shell/http, ./socket, ../types
 * Used by:        ./MatchScreen, ../host/HostConsole
 * Spec:           docs/spec/06-realtime-architecture.md §1, §4, §5; docs/spec/05-api-design.md §2.3
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../shell/http.js';
import type { DomainEventLike, QuickTestResult } from '../types.js';
import { gameSocket, intent } from './socket.js';

export interface MatchSummary {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly gameType: QuickTestResult['gameType'];
  readonly status: 'lobby' | 'running' | 'finished' | 'aborted';
  readonly players: number;
  readonly maxPlayers: number;
  readonly prizes: readonly string[];
  readonly countsForLeaderboard: boolean;
  readonly settings: {
    readonly markingMode: 'auto' | 'manual';
    readonly missedNumbers: QuickTestResult['missedNumbers'];
    readonly drawMode: 'auto' | 'host';
    readonly drawIntervalMs: number;
    // The pause between royale rounds (D14).
    readonly roundPause: { readonly kind: 'wait'; readonly ms: number } | { readonly kind: 'host' };
    // How the match starts (01 §7.6); a set time is announced, `auto` starts it then (D16).
    readonly startRule:
      | { readonly kind: 'host' }
      | { readonly kind: 'at'; readonly at: number; readonly auto: boolean }
      | { readonly kind: 'whenFull' };
  };
  // The end of the running countdown; null before it runs.
  readonly startsAt: number | null;
  // When the next round starts after a cut (the cut screen counts down); null if unknown.
  readonly nextRoundAt: number | null;
  // When Draw next unlocks (D13); null before a round's first draw or outside a round.
  readonly nextDrawAt: number | null;
  // The match waits for its host to start the next round (D14).
  readonly waitingForHost: boolean;
  // The automatic start found fewer than 2 players; the match waits for its host (D16).
  readonly tooFewAtStart: boolean;
  readonly createdBy: string | null;
  // From the server: the signed-in account created this match and may run it. Null in
  // room-wide updates; then the value already known is kept.
  readonly youHost: boolean | null;
}

export interface LiveState {
  readonly match: MatchSummary;
  readonly seq: number;
  readonly me: string | null;
  readonly view: QuickTestResult;
}

interface StateResponse extends LiveState {
  readonly since: number;
}

export function useLiveMatch(code: string): {
  readonly live: LiveState | null;
  readonly error: string | null;
  readonly reload: () => void;
} {
  const [live, setLive] = useState<LiveState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const held = useRef<LiveState | null>(null);
  const busy = useRef<Promise<void>>(Promise.resolve());
  // One delta fetch waiting is enough: it fetches everything since the held seq.
  const queued = useRef(false);
  const load = useCallback(
    (full: boolean) => {
      if (!full && queued.current) return;
      queued.current = !full;
      busy.current = busy.current.then(async () => {
        if (!full) queued.current = false;
        const since = full ? 0 : (held.current?.seq ?? 0);
        try {
          const r = await api<StateResponse>(`/matches/${code}/state?since=${String(since)}`);
          const next = merge(full ? null : held.current, r);
          held.current = next;
          setLive(next);
          setError(null);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not load the match');
        }
      });
    },
    [code],
  );
  useEffect(() => watchRoom({ code, held, load, setLive }), [code, load]);
  return {
    live,
    error,
    reload: () => {
      load(true);
    },
  };
}

// Appends the new events to the held view; everything else comes fresh from the server.
// Frames appended while the fetch ran are already held: those events are not repeated.
function merge(held: LiveState | null, r: StateResponse): LiveState {
  if (held === null || r.since === 0) {
    return { match: r.match, seq: r.seq, me: r.me, view: r.view };
  }
  const fresh = r.view.events.slice(Math.max(0, held.seq - r.since));
  const events = [...held.view.events, ...fresh];
  return { match: r.match, seq: Math.max(r.seq, held.seq), me: r.me, view: { ...r.view, events } };
}

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

function appendable(frame: Frame, me: string | null): boolean {
  return frame.events.every(
    ({ event }) => APPENDABLE.has(event.type) && !('accountId' in event && event.accountId === me),
  );
}

// Watches the match room: a frame that follows the held seq is appended (other players'
// taps) or loads only the new events, a gap or a reconnect loads everything; record
// changes replace the summary.
function watchRoom({ code, held, load, setLive }: RoomArgs): () => void {
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
    if (now !== null && first === heldSeq + 1 && appendable(frame, now.me)) {
      const events = [...now.view.events, ...frame.events.map((e) => e.event)];
      held.current = { ...now, seq: frame.s, view: { ...now.view, events } };
      setLive(held.current);
      return;
    }
    load(first !== heldSeq + 1);
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
