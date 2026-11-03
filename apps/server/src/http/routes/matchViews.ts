/**
 * @file   apps/server/src/http/routes/matchViews.ts
 * @module server/http
 * @brief  What the client sees of a match: the summary and the live view (05 §2.3).
 *
 * Responsibility: the summary (code, title, type, mode, status per the event log, settings,
 *                 players, prizes, countdown, next round, Draw next unlock, waiting for host or
 *                 players (D16), when an async lobby closes (D34), quiet hours until, creator,
 *                 if the viewer hosts) and the live view: the Quick Test payload
 *                 (../../view/clientView) from the public log (no seed, 01 §9), display names,
 *                 caller as owner, from the shared replay (../../view/liveViews). `since` sends
 *                 only later events, no player list unless a join, first round start or finish is
 *                 among them, no cut facts unless a cut is. Round starts and the player list carry only the viewer's cards, no
 *                 draw order (NIGHT-5); a royale pause adds the round recap (`recaps`, D20).
 *                 A player who is out or a spectator also gets the watched cards (`watch`,
 *                 ../../view/watchView, D24); a player still in never does.
 * Depends on:     @sbr/application, @sbr/contracts (types), ../../view/clientView, ../../view/liveViews (types),
 *                 @sbr/domain, ../../view/clientEvents, ../../view/watchView
 * Used by:        ./matches, ../../realtime/gateway
 * Spec:           docs/spec/05-api-design.md §2.3; docs/spec/01-game-design.md §9, §13
 */
import {
  minPlayersOf,
  nextDrawAt,
  tooFewAtStart,
  waitingForHost,
  type ClockFacts,
  type LoadedMatch,
} from '@sbr/application';
import type { RoundRecap } from '@sbr/contracts';
import type { DomainEvent } from '@sbr/domain';

import { liveEvent } from '../../view/clientEvents.js';
import { buildClientView } from '../../view/clientView.js';
import type { LiveEntry } from '../../view/liveViews.js';
import { buildWatchView, watches, type WatchQuery } from '../../view/watchView.js';

// `youHost` tells the viewer whether they created (and so may run) this match; null when
// the summary goes to a whole room (the client keeps what it knew).
// `clock` (MatchEngine.clockFacts): maintenance holds the automatic start (D22); when the
// quiet hours of an asynchronous match end, while it is in them (01 §5).
export function matchSummary(m: LoadedMatch, viewer: string | null, clock: ClockFacts) {
  const r = m.record;
  return {
    id: r.id,
    code: r.code,
    title: r.title,
    gameType: r.gameType,
    // Realtime or asynchronous (01 §11); settings carry the quiet hours and time zone.
    mode: r.ruleset.mode,
    status: statusOf(m),
    players: m.state.playerOrder.length,
    maxPlayers: r.maxPlayers,
    prizes: r.prizes,
    countsForLeaderboard: r.countsForLeaderboard,
    settings: r.settings,
    startsAt: r.startsAt,
    // From the event log (snapshots older than the field have none).
    nextRoundAt: (m.state.nextRoundAt as number | null | undefined) ?? null,
    // When Draw next unlocks (D13) and whether the match waits for its host (D14).
    nextDrawAt: nextDrawAt(m),
    waitingForHost: waitingForHost(m),
    // Players needed to start (the ruleset's lobby.minPlayers, 01 §7.6).
    minPlayers: minPlayersOf(m),
    // The automatic start found too few players: the match waits for its host (D16).
    tooFewAtStart: tooFewAtStart(m, Date.now()),
    // When an asynchronous lobby starts or closes (D31, D33, D34); null for realtime.
    lobbyClosesAt: r.lobbyClosesAt,
    ...clock,
    youHost: viewer === null ? null : r.createdBy === viewer,
  };
}

// The event log ends a match before the record's status follows (NIGHT-5: a fetch that
// carried matchFinished still said "running" and put the console back to running).
function statusOf(m: LoadedMatch): LoadedMatch['record']['status'] {
  if (m.state.phase === 'finished' || m.state.phase === 'aborted') return m.state.phase;
  return m.record.status;
}

interface LiveViewInput {
  readonly match: LoadedMatch;
  // The match's shared replay (../../view/liveViews), extended to its current seq.
  readonly entry: LiveEntry;
  readonly me: string | null;
  readonly since: number;
  // The recap of the royale round just played, during the pause after it (D20).
  readonly recap: RoundRecap | null;
  readonly clock: ClockFacts;
  // What a watching screen asks for (D24): a followed player, the cards it holds.
  readonly watch: WatchQuery;
}

// Events after which the screens need the player list again: a join, the first round's
// cards (later cards come in their roundStarted events), the final places. Other deltas
// leave it out (at 200 players it is 169 of 175 KiB).
function changesPlayers(e: DomainEvent): boolean {
  return (
    e.type === 'playerJoined' ||
    e.type === 'matchFinished' ||
    (e.type === 'roundStarted' && e.roundIndex === 0)
  );
}

export function liveView(input: LiveViewInput) {
  const { match: m, entry, me, since, recap, clock } = input;
  const { idMap, replay } = entry;
  const owner = me !== null && m.state.players[me] !== undefined ? me : null;
  const view = viewerView(m, entry, owner);
  // The viewer's own cards and no draw order in round starts (../../view/clientEvents).
  const viewer = owner === null ? null : (idMap.get(owner) ?? owner);
  // The view's events are the replay's (typed as the domain's events there).
  const events = replay.renamed.slice(since).map((e) => liveEvent(e, viewer));
  const withPlayers = since === 0 || events.some(changesPlayers);
  // The cut facts, like the player list, only when they changed; the client keeps them.
  const withCuts = since === 0 || events.some((e) => e.type === 'cutApplied');
  const { players, cuts, ...rest } = view;
  // Players out and spectators watch the best players still in; players still in never
  // get another player's card (D24, 03 §11).
  const watch = watches(m.state, me) ? buildWatchView(m.state, idMap, input.watch) : undefined;
  return {
    match: matchSummary(m, me, clock),
    seq: replay.length,
    since,
    me: viewer,
    view: {
      ...rest,
      ...(recap === null ? {} : { recaps: [recap] }),
      ...(watch === undefined ? {} : { watch }),
      ...(withPlayers ? { players } : {}),
      ...(withCuts ? { cuts } : {}),
      events,
    },
  };
}

// The client view with the viewer (a player, or null) as its owner, from the shared replay.
function viewerView(m: LoadedMatch, entry: LiveEntry, owner: string | null) {
  const { idMap, replay } = entry;
  const owners = new Map(owner === null ? [] : [[owner, idMap.get(owner) ?? owner]]);
  const s = m.record.settings;
  return buildClientView({
    gameType: m.record.gameType,
    ruleset: m.record.ruleset,
    settings: {
      markingMode: s.markingMode,
      missedNumbers: s.missedNumbers,
      ownerAutoMarkDelayMs: s.missedNumbers.kind === 'autoMarkAfter' ? s.missedNumbers.delayMs : 0,
      drawIntervalMs: s.drawIntervalMs,
      tickedPrizes: m.record.prizes,
    },
    events: [],
    state: m.state,
    idMap,
    owners,
    replay,
    ownCardsOnly: true,
  });
}
