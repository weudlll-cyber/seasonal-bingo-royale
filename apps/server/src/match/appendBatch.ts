/**
 * @file   apps/server/src/match/appendBatch.ts
 * @module server/match
 * @brief  One batch of a match's events into PostgreSQL: one statement, or one transaction when it must.
 *
 * Responsibility: the batch's statement is a chain of data-modifying CTEs: `v` moves the match
 *                 row's version from the expected seq to the batch's last (`… WHERE version =
 *                 expected RETURNING id`, which takes the row lock and is the version check),
 *                 then the events (append-only, consecutive seq) and the read models
 *                 (./projections) each join `v`, so nothing is written when the version is stale;
 *                 no row from `v` raises VersionConflict. A batch of taps, a draw or a window
 *                 close is that one statement (its own transaction, one round trip); a batch with
 *                 a join, the finish (league points, ../leaderboard/awards) or a due snapshot
 *                 runs it inside BEGIN … COMMIT with the joined entries first and the snapshot
 *                 (last 3 kept) and the awards after. Returns how many round trips it took.
 * Depends on:     pg, @sbr/application (types), @sbr/domain (types), ../db/pool,
 *                 ../leaderboard/awards, ./projections
 * Used by:        ./pgMatchStore
 * Spec:           docs/spec/02-software-architecture.md §5.2; docs/spec/04-database-design.md §3.3;
 *                 docs/spec/12-testing-strategy.md §5
 */
import type { AppendInput, StoredEvent } from '@sbr/application';
import type { PoolClient } from 'pg';

import type { DbPool } from '../db/pool.js';
import { awardFinishedMatch } from '../leaderboard/awards.js';
import { insertEntries, projectionParts, SqlParams, type ProjectionInput } from './projections.js';

export class VersionConflict extends Error {}

export interface BatchInput extends AppendInput {
  readonly stored: readonly StoredEvent[];
  // Each event in its stored encoding (./codec encodeStored).
  readonly payloads: readonly string[];
  // The state in its stored encoding when a snapshot is due with this batch, else null.
  readonly snapshot: string | null;
}

function projectionOf(input: BatchInput): ProjectionInput {
  const seq = input.expectedSeq + input.events.length;
  return { ...input, state: input.stateAfter, seq };
}

// The batch's one statement: the version move, the events and the read models together.
function batchStatement(input: BatchInput): { text: string; values: unknown[] } {
  const p = new SqlParams();
  const last = input.expectedSeq + input.events.length;
  const version = `UPDATE sbr.matches SET version = ${p.add(last)}
     WHERE id = ${p.add(input.matchId)} AND version = ${p.add(input.expectedSeq)} RETURNING id`;
  const events = `INSERT INTO sbr.match_events (match_id, seq, type, payload, occurred_at, actor_account_id)
     SELECT v.id, u.seq, u.type, u.payload::jsonb, to_timestamp(${p.add(input.at)} / 1000.0), ${p.add(input.actorAccountId)}
       FROM v, unnest(${p.add(input.stored.map((s) => s.seq))}::bigint[], ${p.add(input.stored.map((s) => s.event.type))}::text[],
            ${p.add(input.payloads)}::text[]) AS u(seq, type, payload)`;
  const parts = [
    { name: 'v', sql: version },
    { name: 'events', sql: events },
    ...projectionParts(p, projectionOf(input)),
  ];
  const text = `WITH ${parts.map((c) => `${c.name} AS (${c.sql})`).join(',\n')}
     SELECT count(*)::int AS moved FROM v`;
  return { text, values: p.values };
}

async function run(client: DbPool | PoolClient, input: BatchInput): Promise<void> {
  const { text, values } = batchStatement(input);
  const r = await client.query<{ moved: number }>(text, values);
  if ((r.rows[0]?.moved ?? 0) === 0) throw new VersionConflict(input.matchId);
}

// A join, the finish or a snapshot need statements of their own around the batch's one.
function needsTransaction(input: BatchInput): boolean {
  return (
    input.snapshot !== null ||
    input.events.some((e) => e.type === 'playerJoined' || e.type === 'matchFinished')
  );
}

// The batch's round trips: 1 for the plain statement; more inside a transaction.
export async function appendBatch(pool: DbPool, input: BatchInput): Promise<number> {
  if (!needsTransaction(input)) {
    await run(pool, input);
    return 1;
  }
  const client = await pool.connect();
  let trips = 0;
  // The client as the statements see it, counting each round trip.
  const tx = {
    query: (...args: unknown[]) => {
      trips += 1;
      return (client.query as (...a: unknown[]) => unknown).apply(client, args);
    },
  } as unknown as PoolClient;
  try {
    await tx.query('BEGIN');
    await insertEntries(tx, projectionOf(input));
    await run(tx, input);
    if (input.snapshot !== null) await snapshot(tx, input);
    if (input.events.some((e) => e.type === 'matchFinished')) {
      await awardFinishedMatch(tx, projectionOf(input));
    }
    await tx.query('COMMIT');
    return trips;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// The snapshot of the state after the batch; the newest 3 of the match are kept.
async function snapshot(client: PoolClient, input: BatchInput): Promise<void> {
  const seq = input.expectedSeq + input.events.length;
  await client.query(
    'INSERT INTO sbr.match_snapshots (match_id, seq, state) VALUES ($1, $2, $3::jsonb)',
    [input.matchId, seq, input.snapshot],
  );
  await client.query(
    `DELETE FROM sbr.match_snapshots WHERE match_id = $1 AND seq NOT IN
       (SELECT seq FROM sbr.match_snapshots WHERE match_id = $1 ORDER BY seq DESC LIMIT 3)`,
    [input.matchId],
  );
}
