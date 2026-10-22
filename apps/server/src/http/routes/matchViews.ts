/**
 * @file   apps/server/src/http/routes/matchViews.ts
 * @module server/http
 * @brief  What the client sees of a match: the summary and the live view (05 §2.3).
 *
 * Responsibility: the summary (code, title, game type, status, settings, player count,
 *                 prizes, countdown end, next round's start, when Draw next unlocks, whether
 *                 the match waits for its host or for players at its start time (D16),
 *                 creator, whether the viewer hosts it) and the live
 *                 view the player and host screens fold with the Quick Test's playback logic: the same payload as
 *                 the Quick Test (../../view/clientView) built from the public event log
 *                 (seed removed, 01 §9), with every player named by display name and the
 *                 caller as the owner, from the match's shared replay (../../view/liveViews).
 *                 `since` limits the events to those after a seq, so a client that already
 *                 holds the start of the log fetches only the rest.
 * Depends on:     @sbr/application, ../../view/clientView, ../../view/liveViews (types)
 * Used by:        ./matches, ../../realtime/gateway
 * Spec:           docs/spec/05-api-design.md §2.3; docs/spec/01-game-design.md §9, §13
 */
import { nextDrawAt, tooFewAtStart, waitingForHost, type LoadedMatch } from '@sbr/application';

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
    status: r.status,
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
    // The automatic start found fewer than 2 players: the match waits for its host (D16).
    tooFewAtStart: tooFewAtStart(m, Date.now()),
    createdBy: r.createdBy,
    youHost: viewer === null ? null : r.createdBy === viewer,
  };
}

export interface LiveViewInput {
  readonly match: LoadedMatch;
  // The match's shared replay (../../view/liveViews), extended to its current seq.
  readonly entry: LiveEntry;
  readonly me: string | null;
  readonly since: number;
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
  });
  return {
    match: matchSummary(m, me),
    seq: replay.length,
    since,
    me: owner === null ? null : (idMap.get(owner) ?? owner),
    view: { ...view, events: view.events.slice(since) },
  };
}
