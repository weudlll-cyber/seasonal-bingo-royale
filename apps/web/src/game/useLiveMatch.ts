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
import type { QuickTestResult } from '../types.js';
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
  };
  readonly startsAt: number | null;
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
  const load = useCallback(
    (full: boolean) => {
      busy.current = busy.current.then(async () => {
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
function merge(held: LiveState | null, r: StateResponse): LiveState {
  const events =
    held === null || r.since === 0 ? r.view.events : [...held.view.events, ...r.view.events];
  return { match: r.match, seq: r.seq, me: r.me, view: { ...r.view, events } };
}

interface RoomArgs {
  readonly code: string;
  readonly held: { current: LiveState | null };
  readonly load: (full: boolean) => void;
  readonly setLive: (live: LiveState) => void;
}

// Watches the match room: a frame that follows the held seq loads only the new events, a
// gap or a reconnect loads everything; record changes replace the summary.
function watchRoom({ code, held, load, setLive }: RoomArgs): () => void {
  const socket = gameSocket();
  const watch = (): void => {
    void intent('match.watch', { code });
    load(true);
  };
  const onEvents = (frame: { s: number; events: readonly { s: number }[] }): void => {
    const first = frame.events[0]?.s ?? frame.s;
    const heldSeq = held.current?.seq ?? 0;
    if (frame.s <= heldSeq) return;
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
