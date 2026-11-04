/**
 * @file   apps/server/src/match/projections.ts
 * @module server/match
 * @brief  Read models written in the same transaction as the events (02 §5.2, 04 §3.3).
 *
 * Responsibility: from one appended batch and the state after it: new entries for joined
 *                 players (bots have no account; seen up to the join), the entry columns of
 *                 every player the batch touched (score, state, elimination round, shield
 *                 charges, seasons, final place) and their standings rows with the ranks (all
 *                 players at a round end, cut, stage or finish), one `marks` row per
 *                 marked cell with its source and speed bonus; on `matchFinished` the league
 *                 points and badges (../leaderboard/awards, 03 §11). Batched SQL with unnest,
 *                 so a draw with 200 players is a handful of statements.
 * Depends on:     pg (PoolClient), @sbr/domain, @sbr/application (types), ../leaderboard/awards
 * Used by:        ./pgMatchStore
 * Spec:           docs/spec/04-database-design.md §3.3, §3.4; docs/spec/02-software-architecture.md §5.2
 */
import type { MarkContext } from '@sbr/application';
import type { DomainEvent, MatchState } from '@sbr/domain';
import type { PoolClient } from 'pg';

import { awardFinishedMatch } from '../leaderboard/awards.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Events after which every player's row may have changed (cut, stage carry, finish).
const ALL_PLAYERS = new Set(['cutApplied', 'stageStarted', 'matchFinished', 'roundEnded']);

interface ProjectionInput {
  readonly matchId: string;
  readonly events: readonly DomainEvent[];
  readonly state: MatchState;
  readonly seq: number;
  // When the batch happened (epoch ms): a finished match's leagues use it as the finish time.
  readonly at: number;
  readonly mark: MarkContext | null;
}

export async function project(client: PoolClient, input: ProjectionInput): Promise<void> {
  await insertEntries(client, input);
  const touched = touchedPlayers(input);
  if (touched.length === 0) return;
  await updateEntries(client, input, touched);
  await writeStandings(client, input, touched);
  await insertMarks(client, input);
  // League points and badges only in reaction to the finish, in this transaction (03 §11).
  if (input.events.some((e) => e.type === 'matchFinished')) {
    await awardFinishedMatch(client, input);
  }
}

async function insertEntries(client: PoolClient, input: ProjectionInput): Promise<void> {
  const joined = input.events.flatMap((e) => (e.type === 'playerJoined' ? [e.accountId] : []));
  if (joined.length === 0) return;
  // A player has seen the match up to the join (the away summary starts there, 01 §11).
  await client.query(
    `INSERT INTO sbr.match_entries (match_id, player_id, account_id, is_bot, last_seen_event_seq)
     SELECT $1, p, CASE WHEN p ~* $3 THEN p::uuid END, p LIKE 'bot-%', $4
       FROM unnest($2::text[]) AS p
     ON CONFLICT DO NOTHING`,
    [input.matchId, joined, UUID.source, input.seq],
  );
}

function touchedPlayers(input: ProjectionInput): readonly string[] {
  if (input.events.some((e) => ALL_PLAYERS.has(e.type))) return input.state.playerOrder;
  const ids = new Set<string>();
  for (const e of input.events) if ('accountId' in e) ids.add(e.accountId);
  return [...ids];
}

async function updateEntries(
  client: PoolClient,
  input: ProjectionInput,
  ids: readonly string[],
): Promise<void> {
  const place = new Map(input.state.finalPlacement.map((p) => [p.accountId, p.place]));
  const rows = ids.flatMap((id) => {
    const p = input.state.players[id];
    return p === undefined ? [] : [{ id, p }];
  });
  await client.query(
    `UPDATE sbr.match_entries e SET score = u.score, state = u.state,
       eliminated_at_round = u.out_round, shield_charges = u.shield,
       seasons_activated = u.seasons, final_place = u.place
     FROM unnest($2::text[], $3::bigint[], $4::text[], $5::int[], $6::int[], $7::smallint[], $8::int[])
       AS u(player_id, score, state, out_round, shield, seasons, place)
     WHERE e.match_id = $1 AND e.player_id = u.player_id`,
    [
      input.matchId,
      rows.map((r) => r.id),
      rows.map((r) => r.p.points),
      rows.map((r) => (r.p.eliminatedAtRound === null ? 'active' : 'eliminated')),
      rows.map((r) => r.p.eliminatedAtRound),
      rows.map((r) => r.p.effects.shieldCharges),
      rows.map((r) => r.p.effects.seasonsActivated),
      rows.map((r) => place.get(r.id) ?? null),
    ],
  );
}

// Rank by points among all players, ties by join order (display only; cuts use the domain).
// Only the touched players' rows: a mark rewrites the marking player's row (others' ranks
// follow at the next round end, cut, stage or finish, which touch everyone). The load check
// of 2026-11-04: 64 marks a draw each rewriting 200 rows held up the match's draws.
async function writeStandings(
  client: PoolClient,
  input: ProjectionInput,
  touched: readonly string[],
): Promise<void> {
  const write = new Set(touched);
  const ranked = [...input.state.playerOrder].sort(
    (a, b) => (input.state.players[b]?.points ?? 0) - (input.state.players[a]?.points ?? 0),
  );
  const rows = ranked.flatMap((id, i) => (write.has(id) ? [{ id, rank: i + 1 }] : []));
  await client.query(
    `INSERT INTO sbr.standings (match_id, player_id, rank, score, seasons, updated_seq)
     SELECT $1, u.player_id, u.rank, u.score, u.seasons, $5
       FROM unnest($2::text[], $3::bigint[], $4::smallint[], $6::int[])
         AS u(player_id, score, seasons, rank)
     ON CONFLICT (match_id, player_id) DO UPDATE
       SET rank = EXCLUDED.rank, score = EXCLUDED.score, seasons = EXCLUDED.seasons,
           updated_seq = EXCLUDED.updated_seq`,
    [
      input.matchId,
      rows.map((r) => r.id),
      rows.map((r) => input.state.players[r.id]?.points ?? 0),
      rows.map((r) => input.state.players[r.id]?.effects.seasonsActivated ?? 0),
      input.seq,
      rows.map((r) => r.rank),
    ],
  );
}

async function insertMarks(client: PoolClient, input: ProjectionInput): Promise<void> {
  const round = input.state.currentRound;
  const marks = input.events.flatMap((e) => (e.type === 'cellMarked' ? [e] : []));
  if (round === null || marks.length === 0) return;
  const drawIndexOf = (m: (typeof marks)[number]): number | null => {
    const cell = round.cards[m.accountId]?.[m.cardIndex]?.card.cells[m.cellIndex];
    return cell === undefined || cell.kind === 'free' ? null : round.draws.indexOf(cell.value);
  };
  const manual = input.mark?.source === 'manual';
  await client.query(
    `INSERT INTO sbr.marks (match_id, player_id, round_index, card_index, cell, draw_index, source, speed_bonus)
     SELECT $1, u.player_id, $2, u.card_index, u.cell, u.draw_index, $6, $7
       FROM unnest($3::text[], $4::smallint[], $5::smallint[], $8::smallint[])
         AS u(player_id, card_index, cell, draw_index)
     ON CONFLICT DO NOTHING`,
    [
      input.matchId,
      round.roundIndex,
      marks.map((m) => m.accountId),
      marks.map((m) => m.cardIndex),
      marks.map((m) => m.cellIndex),
      manual ? 'manual' : 'auto',
      manual ? input.mark.speedBonus : 0,
      marks.map(drawIndexOf),
    ],
  );
}
