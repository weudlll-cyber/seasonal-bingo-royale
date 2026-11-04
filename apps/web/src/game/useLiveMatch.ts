/**
 * @file   apps/web/src/game/useLiveMatch.ts
 * @module web/game
 * @brief  A live match on screen: the server's view, kept current over the WebSocket.
 *
 * Responsibility: load GET /matches/:code/state, then keep it current from the match room's
 *                 steps (./matchRoom: each step applied without a request); a gap fetches only the
 *                 events after the seq already held (`since`) and appends them; only a (re)connect
 *                 reloads everything, so nothing is lost or doubled (06 §4, §5, §8). A delta without the player list
 *                 keeps the one held. Record changes (status, start time, draw control) arrive as
 *                 `match`; once an announced start time has passed, the summary is fetched once
 *                 more (D16: it changes by the clock alone). Fetches never overlap. The view has
 *                 the Quick Test's shape, so the screens fold it with the same logic. A watching
 *                 screen (a player out or a spectator, D24) names the player it follows and the
 *                 cards it holds; the watched card layouts it receives go into the held round
 *                 start, so the fold shows their marks; a watched player's taps fetch at once
 *                 ("1 to go" comes from the server). The cut facts, like the player list, are
 *                 kept when a delta leaves them out.
 * Depends on:     react, @sbr/contracts (mergeAnswer), ../shell/http, ./liveTypes (its types,
 *                 re-exported), ./liveView (the watch query), ./matchRoom (the WebSocket room)
 * Used by:        ./MatchScreen, ../host/HostConsole, ./HostLink, ./Lobby, ./MatchCancelled,
 *                 ./Registration, ./WaitingRoom, ./labels, ../host/HostDrawControls,
 *                 ../host/HostLobby, ../test/matchFixture; its types also ./liveView, ./matchRoom
 * Spec:           docs/spec/06-realtime-architecture.md §1, §4, §5; docs/spec/05-api-design.md §2.3
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../shell/http.js';
import { mergeAnswer, type LiveAnswer } from '@sbr/contracts';

import { watchParams } from './liveView.js';
import type { LiveState, MatchSummary } from './liveTypes.js';
import { followInRoom, watchRoom } from './matchRoom.js';

export type { LiveState, MatchSummary } from './liveTypes.js';

export function useLiveMatch(code: string): {
  readonly live: LiveState | null;
  readonly error: string | null;
  readonly reload: () => void;
  // A watching screen follows one player still in, or the top 4 again (null, D24).
  readonly follow: (name: string | null) => void;
} {
  const [live, setLive] = useState<LiveState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const held = useRef<LiveState | null>(null);
  const busy = useRef<Promise<void>>(Promise.resolve());
  // One delta fetch waiting is enough: it fetches everything since the held seq.
  const queued = useRef(false);
  const followed = useRef<string | null>(null);
  const load = useCallback(
    (full: boolean) => {
      if (!full && queued.current) return;
      queued.current = !full;
      busy.current = busy.current.then(async () => {
        if (!full) queued.current = false;
        const since = full ? 0 : (held.current?.seq ?? 0);
        const watch = watchParams(full ? null : held.current, followed.current);
        try {
          const r = await api<LiveAnswer<MatchSummary>>(
            `/matches/${code}/state?since=${String(since)}${watch}`,
          );
          const next = mergeAnswer(full ? null : held.current, r);
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
  useRefreshAtStartTime(live, load);
  return {
    live,
    error,
    reload: () => {
      load(true);
    },
    follow: (name) => {
      followed.current = name;
      followInRoom(code, name);
      load(false);
    },
  };
}

// At an announced start time the server's summary changes by the clock alone (the
// automatic start, or "too few at the start time", D16): ask once a second after it, so the
// screen never depends on a push it may have missed. Display only; the server decides.
function useRefreshAtStartTime(live: LiveState | null, load: (full: boolean) => void): void {
  const m = live?.match;
  const rule = m?.settings.startRule;
  const at = m?.status === 'lobby' && m.startsAt === null && rule?.kind === 'at' ? rule.at : null;
  useEffect(() => {
    if (at === null) return undefined;
    const id = window.setTimeout(
      () => {
        load(false);
      },
      Math.max(0, at - Date.now()) + 1_000,
    );
    return () => {
      window.clearTimeout(id);
    };
  }, [at, load]);
}
