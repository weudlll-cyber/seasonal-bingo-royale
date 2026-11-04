/**
 * @file   apps/server/src/match/projections.test.ts
 * @module server/match
 * @brief  The standings projection: a player's mark rewrites that player's row, not all of them.
 *
 * Responsibility: with a fake client that records the queries, a batch from one player's mark
 *                 writes the standings row of that player only (the load check: 64 marks a draw
 *                 rewrote all 200 rows each, so the match's queue fell behind its draws); a round
 *                 end writes every player's row with the ranks.
 * Depends on:     vitest, @sbr/domain (types), pg (types), ./projections
 * Spec:           docs/spec/04-database-design.md §3.3; docs/spec/12-testing-strategy.md §5
 */
import type { DomainEvent, MatchState } from '@sbr/domain';
import type { PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';

import { project } from './projections.js';

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

// The player ids each standings statement wrote.
async function standingsWrites(
  events: readonly DomainEvent[],
  manual: boolean,
): Promise<string[][]> {
  const written: string[][] = [];
  const client = {
    query: (sql: string, params: unknown[]) => {
      if (sql.includes('sbr.standings')) written.push(params[1] as string[]);
      return Promise.resolve({ rows: [] });
    },
  } as unknown as PoolClient;
  await project(client, {
    matchId: 'm',
    events,
    state,
    seq: 7,
    at: 0,
    mark: manual ? { source: 'manual' } : null,
  });
  return written;
}

describe('the standings projection', () => {
  it("writes only the marking player's row for a mark", async () => {
    const mark = { type: 'cellMarked', accountId: 'b', cardIndex: 0, cellIndex: 3 };
    expect(await standingsWrites([mark as unknown as DomainEvent], true)).toEqual([['b']]);
  });

  it("writes every player's row with the ranks at a round end", async () => {
    const end = { type: 'roundEnded', roundIndex: 0 };
    const writes = await standingsWrites([end as unknown as DomainEvent], false);
    expect(writes).toHaveLength(1);
    expect([...(writes[0] ?? [])].sort()).toEqual(PLAYERS);
  });
});
