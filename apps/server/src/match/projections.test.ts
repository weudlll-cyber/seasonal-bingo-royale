/**
 * @file   apps/server/src/match/projections.test.ts
 * @module server/match
 * @brief  The standings projection: a player's mark rewrites that player's row, not all of them.
 *
 * Responsibility: in the batch's statement parts, a batch from one player's mark writes the
 *                 standings row of that player only (the load check: 64 marks a draw
 *                 rewrote all 200 rows each, so the match's queue fell behind its draws); a round
 *                 end writes every player's row with the ranks.
 * Depends on:     vitest, @sbr/domain (types), ./projections
 * Spec:           docs/spec/04-database-design.md §3.3; docs/spec/12-testing-strategy.md §5
 */
import type { DomainEvent, MatchState } from '@sbr/domain';
import { describe, expect, it } from 'vitest';

import { projectionParts, SqlParams } from './projections.js';

const PLAYERS = ['a', 'b', 'c'];

// The few state fields the projection reads.
const state = {
  playerOrder: PLAYERS,
  players: Object.fromEntries(
    PLAYERS.map((id, i) => [
      id,
      {
        points: 10 * i,
        eliminatedAtRound: null,
        effects: { shieldCharges: 0, seasonsActivated: 0 },
      },
    ]),
  ),
  finalPlacement: [],
  currentRound: null,
} as unknown as MatchState;

// The player ids each standings part writes (its first unnest parameter).
function standingsWrites(events: readonly DomainEvent[], manual: boolean): string[][] {
  const p = new SqlParams();
  const parts = projectionParts(p, {
    matchId: 'm',
    events,
    state,
    seq: 7,
    at: 0,
    mark: manual ? { source: 'manual' } : null,
  });
  return parts.flatMap((part) => {
    if (part.name !== 'standings') return [];
    const at = Number(/unnest\(\$(\d+)::text\[\]/.exec(part.sql)?.[1] ?? 0);
    return [p.values[at - 1] as string[]];
  });
}

describe('the standings projection', () => {
  it("writes only the marking player's row for a mark", () => {
    const mark = { type: 'cellMarked', accountId: 'b', cardIndex: 0, cellIndex: 3 };
    expect(standingsWrites([mark as unknown as DomainEvent], true)).toEqual([['b']]);
  });

  it("writes every player's row with the ranks at a round end", () => {
    const end = { type: 'roundEnded', roundIndex: 0 };
    const writes = standingsWrites([end as unknown as DomainEvent], false);
    expect(writes).toHaveLength(1);
    expect([...(writes[0] ?? [])].sort()).toEqual(PLAYERS);
  });
});
