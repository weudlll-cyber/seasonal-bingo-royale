/**
 * @file   apps/server/src/http/routes/matchViews.ts
 * @module server/http
 * @brief  What the client sees of a match: the summary and the public state (05 §2.3).
 *
 * Responsibility: the summary (code, title, game type, status, settings, player count,
 *                 prizes, start time) and the state the player and host screens fold with
 *                 the same playback logic as the Quick Test: the public event log (the seed
 *                 removed, 01 §9) with its last seq, the speed window and scoring values the
 *                 card needs, the display name of every player, and the caller's player id.
 * Depends on:     @sbr/application (types), @sbr/application, ../../match/codec
 * Used by:        ./matches, ../../realtime/gateway
 * Spec:           docs/spec/05-api-design.md §2.3; docs/spec/01-game-design.md §9
 */
import { drawRange, type LoadedMatch, type StoredEvent } from '@sbr/application';

import { publicEvent } from '../../match/codec.js';

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

export function publicState(
  m: LoadedMatch,
  events: readonly StoredEvent[],
  names: Readonly<Record<string, string>>,
  me: string | null,
) {
  const ruleset = m.record.ruleset;
  return {
    match: matchSummary(m),
    seq: m.seq,
    events: events.map((e) => ({ s: e.seq, at: e.occurredAt, event: publicEvent(e.event) })),
    speedWindowMs: ruleset.marking.speedWindowMs,
    pointsPerMark: ruleset.scoring.pointsPerMark,
    maxSpeedBonus: ruleset.scoring.maxSpeedBonus,
    drawIntervalRangeMs: drawRange(ruleset.marking.speedWindowMs),
    names,
    me: me !== null && m.state.players[me] !== undefined ? me : null,
  };
}
