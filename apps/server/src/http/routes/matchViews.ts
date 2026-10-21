/**
 * @file   apps/server/src/http/routes/matchViews.ts
 * @module server/http
 * @brief  What the client sees of a match: the summary and the live view (05 §2.3).
 *
 * Responsibility: the summary (code, title, game type, status, settings, player count,
 *                 prizes, start time, creator) and the live view the player and host
 *                 screens fold with the Quick Test's playback logic: the same payload as
 *                 the Quick Test (../../view/clientView) built from the public event log
 *                 (seed removed, 01 §9), with every player named by display name and the
 *                 caller as the owner. `since` limits the events to those after a seq, so a
 *                 client that already holds the start of the log fetches only the rest.
 * Depends on:     @sbr/application (types), ../../match/codec, ../../view/clientView
 * Used by:        ./matches, ../../realtime/gateway
 * Spec:           docs/spec/05-api-design.md §2.3; docs/spec/01-game-design.md §9, §13
 */
import type { LoadedMatch, StoredEvent } from '@sbr/application';

import { publicEvent } from '../../match/codec.js';
import { buildClientView } from '../../view/clientView.js';

export function matchSummary(m: LoadedMatch) {
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
    createdBy: r.createdBy,
  };
}

export interface LiveViewInput {
  readonly match: LoadedMatch;
  readonly events: readonly StoredEvent[];
  readonly names: Readonly<Record<string, string>>;
  readonly me: string | null;
  readonly since: number;
}

export function liveView({ match: m, events, names, me, since }: LiveViewInput) {
  const idMap = new Map(m.state.playerOrder.map((id) => [id, names[id] ?? id]));
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
    events: events.map((e) => publicEvent(e.event)),
    state: m.state,
    idMap,
    owners,
  });
  return {
    match: matchSummary(m),
    seq: m.seq,
    since,
    me: owner === null ? null : (idMap.get(owner) ?? owner),
    view: { ...view, events: view.events.slice(since) },
  };
}
