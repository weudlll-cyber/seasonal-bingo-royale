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
 *                 the Quick Test's shape, so the screens fold it with the same logic.
 * Depends on:     react, ../shell/http, ./socket, ../types
 * Used by:        ./MatchScreen, ../host/HostConsole, ./HostLink, ./Lobby, ./MatchCancelled,
 *                 ./Registration, ./WaitingRoom, ./labels, ../host/HostDrawControls,
 *                 ../host/HostLobby, ../test/matchFixture
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
  // Players needed to start (the ruleset's lobby.minPlayers, 01 §7.6).
  readonly minPlayers: number;
  // The automatic start found too few players; the match waits for its host (D16).
  readonly tooFewAtStart: boolean;
  // Maintenance holds the automatic start (D22).
  readonly startHeld?: boolean;
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

// A delta (since > 0) leaves out the player list unless a join, a round start or the
// finish is among its events; the client keeps the list it holds.
interface StateResponse extends Omit<LiveState, 'view'> {
  readonly since: number;
  readonly view: Omit<QuickTestResult, 'players'> & Partial<Pick<QuickTestResult, 'players'>>;
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
  useRefreshAtStartTime(live, load);
  return {
    live,
    error,
    reload: () => {
      load(true);
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

// Appends the new events to the held view; everything else comes fresh from the server.
// Frames appended while the fetch ran are already held: those events are not repeated.
function merge(held: LiveState | null, r: StateResponse): LiveState {
  const players = r.view.players ?? held?.view.players ?? [];
  if (held === null || r.since === 0) {
    return { match: r.match, seq: r.seq, me: r.me, view: { ...r.view, players } };
  }
  const fresh = r.view.events.slice(Math.max(0, held.seq - r.since));
  const events = [...held.view.events, ...fresh];
  const view = { ...r.view, players, events };
  return { match: r.match, seq: Math.max(r.seq, held.seq), me: r.me, view };
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
// taps); any other frame, a gap included, loads only the new events; a (re)connect loads
// everything; record changes replace the summary.
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
