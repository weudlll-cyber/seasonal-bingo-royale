/**
 * @file   apps/server/src/http/routes/matchViews.ts
 * @module server/http
 * @brief  What the client sees of a match: the summary and the live view (05 §2.3).
 *
 * Responsibility: the summary (code, title, game type, status — finished or aborted as soon
 *                 as the event log says so —, settings, player count,
 *                 prizes, countdown end, next round's start, when Draw next unlocks, whether
 *                 the match waits for its host or for players at its start time (D16),
 *                 creator, whether the viewer hosts it) and the live
 *                 view the player and host screens fold with the Quick Test's playback logic: the same payload as
 *                 the Quick Test (../../view/clientView) built from the public event log
 *                 (seed removed, 01 §9), with every player named by display name and the
 *                 caller as the owner, from the match's shared replay (../../view/liveViews).
 *                 `since` limits the events to those after a seq, so a client that already
 *                 holds the start of the log fetches only the rest; such a delta leaves out
 *                 the player list unless a join, the first round's start or the finish is
 *                 among its events (the client keeps the list it holds). Round starts carry
 *                 only the viewer's own cards and no draw order; the player list only the
 *                 viewer's first-round card (NIGHT-5).
 * Depends on:     @sbr/application, ../../view/clientView, ../../view/liveViews (types),
 *                 @sbr/domain, ../../view/clientEvents
 * Used by:        ./matches, ../../realtime/gateway
 * Spec:           docs/spec/05-api-design.md §2.3; docs/spec/01-game-design.md §9, §13
 */
import {
  minPlayersOf,
  nextDrawAt,
  tooFewAtStart,
  waitingForHost,
  type LoadedMatch,
} from '@sbr/application';
import type { DomainEvent } from '@sbr/domain';

import { liveEvent } from '../../view/clientEvents.js';
import { buildClientView } from '../../view/clientView.js';
import type { LiveEntry } from '../../view/liveViews.js';

// `youHost` tells the viewer whether they created (and so may run) this match; null when
// the summary goes to a whole room (the client keeps what it knew).
export function matchSummary(m: LoadedMatch, viewer: string | null) {
  const r = m.record;
  return {
    id: r.id,
    code: r.code,
    title: r.title,
    gameType: r.gameType,
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

export function liveView({ match: m, entry, me, since }: LiveViewInput) {
  const { idMap, replay } = entry;
  const owner = me !== null && m.state.players[me] !== undefined ? me : null;
  const owners = new Map(owner === null ? [] : [[owner, idMap.get(owner) ?? owner]]);
  const s = m.record.settings;
  const view = buildClientView({
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
  // The viewer's own cards and no draw order in round starts (../../view/clientEvents).
  const viewer = owner === null ? null : (idMap.get(owner) ?? owner);
  // The view's events are the replay's (typed as the domain's events there).
  const events = replay.renamed.slice(since).map((e) => liveEvent(e, viewer));
  const withPlayers = since === 0 || events.some(changesPlayers);
  const { players, ...rest } = view;
  return {
    match: matchSummary(m, me),
    seq: replay.length,
    since,
    me: viewer,
    view: withPlayers ? { ...rest, players, events } : { ...rest, events },
  };
}
