/**
 * @file   apps/web/src/game/useLiveMatch.ts
 * @module web/game
 * @brief  A live match on screen: the server's view, kept current over the WebSocket.
 *
 * Responsibility: load GET /matches/:code/state, watch the match room, and on every event frame
 *                 fetch only the events after the seq already held (`since`) and append them — a
 *                 gap too, since that fetch covers it; only a (re)connect reloads everything, so
 *                 nothing is lost or doubled (06 §4, §5, §8). A delta without the player list
 *                 keeps the one held. Record changes (status, start time, draw control) arrive as
 *                 `match`; once an announced start time has passed, the summary is fetched once
 *                 more (D16: it changes by the clock alone). Fetches never overlap. The view has
 *                 the Quick Test's shape, so the screens fold it with the same logic. A watching
 *                 screen (a player out or a spectator, D24) names the player it follows and the
 *                 cards it holds; the watched card layouts it receives go into the held round
 *                 start, so the fold shows their marks; a watched player's taps fetch at once
 *                 ("1 to go" comes from the server). The cut facts, like the player list, are
 *                 kept when a delta leaves them out.
 * Depends on:     react, ../shell/http, ../types, ./liveView (merging the answers), ./matchRoom
 *                 (the WebSocket room)
 * Used by:        ./MatchScreen, ../host/HostConsole, ./HostLink, ./Lobby, ./MatchCancelled,
 *                 ./Registration, ./WaitingRoom, ./labels, ../host/HostDrawControls,
 *                 ../host/HostLobby, ../test/matchFixture; its types also ./liveView, ./matchRoom
 * Spec:           docs/spec/06-realtime-architecture.md §1, §4, §5; docs/spec/05-api-design.md §2.3
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../shell/http.js';
import type { QuickTestResult } from '../types.js';
import { merge, watchParams, type StateResponse } from './liveView.js';
import { watchRoom } from './matchRoom.js';

export interface MatchSummary {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly gameType: QuickTestResult['gameType'];
  // Realtime or asynchronous (01 §11).
  readonly mode: 'realtime' | 'async';
  readonly status: 'lobby' | 'running' | 'finished' | 'aborted';
  readonly players: number;
  readonly maxPlayers: number;
  // Every place is taken (the server counts): no one can join, watching stays open.
  readonly full: boolean;
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
    // Asynchronous matches: no draws inside these hours of the match's time zone (01 §5).
    readonly quietHours: { readonly startHour: number; readonly endHour: number } | null;
    readonly timeZone: string;
  };
  // The end of the running countdown; when an async lobby starts or closes (D34). Else null.
  readonly startsAt: number | null;
  readonly lobbyClosesAt: number | null;
  // When the next round starts after a cut (the cut screen counts down); null if unknown.
  readonly nextRoundAt: number | null;
  // When Draw next unlocks (D13); null before a round's first draw or outside a round.
  readonly nextDrawAt: number | null;
  // The match waits for its host to start the next round (D14).
  readonly waitingForHost: boolean;
  // Players needed to start (the ruleset's lobby.minPlayers, 01 §7.6).
  readonly minPlayers: number;
  // The automatic start found too few players; the match waits for its host (D16).
  readonly tooFewAtStart: boolean;
  // Maintenance holds the automatic start (D22).
  readonly startHeld?: boolean;
  // When the quiet hours the match is in end (01 §5); null outside them.
  readonly quietUntil: number | null;
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
          const r = await api<StateResponse>(
            `/matches/${code}/state?since=${String(since)}${watch}`,
          );
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
  useRefreshAtStartTime(live, load);
  return {
    live,
    error,
    reload: () => {
      load(true);
    },
    follow: (name) => {
      followed.current = name;
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
