/**
 * @file   apps/server/src/match/projections.ts
 * @module server/match
 * @brief  Read models written with the events, as parts of the batch's one statement (02 §5.2, 04 §3.3).
 *
 * Responsibility: from one appended batch and the state after it: the entry columns of every
 *                 player the batch touched (score, state, elimination round, shield charges,
 *                 seasons, final place) and their standings rows with the ranks (all players at
 *                 a round end, cut, stage or finish), one `marks` row per marked cell with its
 *                 source and speed bonus. Each is a data-modifying CTE part that joins the
 *                 version part `v` (./appendBatch), so it writes only when the batch's version
 *                 check passed; ./appendBatch puts them into one statement with the events.
 *                 New entries for joined players (bots have no account; seen up to the join) are
 *                 a statement of their own, before it (a CTE could not update the rows a sibling
 *                 inserts). Batched SQL with unnest. Pure SQL building, no I/O but insertEntries.
 * Depends on:     pg (PoolClient), @sbr/domain, @sbr/application (types)
 * Used by:        ./appendBatch
 * Spec:           docs/spec/04-database-design.md §3.3, §3.4; docs/spec/02-software-architecture.md §5.2
 */
import { markKey, type MarkContext } from '@sbr/application';
import type { DomainEvent, MatchState } from '@sbr/domain';
import type { PoolClient } from 'pg';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Events after which every player's row may have changed (cut, stage carry, finish).
const ALL_PLAYERS = new Set(['cutApplied', 'stageStarted', 'matchFinished', 'roundEnded']);

export interface ProjectionInput {
  readonly matchId: string;
  readonly events: readonly DomainEvent[];
  readonly state: MatchState;
  readonly seq: number;
  // When the batch happened (epoch ms): a finished match's leagues use it as the finish time.
  readonly at: number;
  readonly mark: MarkContext | null;
}

// Positional parameters of one statement, numbered as they are added.
export class SqlParams {
  readonly values: unknown[] = [];
  add(value: unknown): string {
    this.values.push(value);
    return `$${String(this.values.length)}`;
  }
}

// One part of the batch's statement: `name AS (sql)`.
export interface CtePart {
  readonly name: string;
  readonly sql: string;
}

// The read-model parts of the batch: entries, standings and marks of the touched players.
export function projectionParts(p: SqlParams, input: ProjectionInput): CtePart[] {
  const touched = touchedPlayers(input);
  if (touched.length === 0) return [];
  const marks = marksPart(p, input);
  return [entriesPart(p, input, touched), standingsPart(p, input, touched), ...marks];
}

// Before the batch's statement, in its transaction: the entries of the players who joined.
export async function insertEntries(client: PoolClient, input: ProjectionInput): Promise<void> {
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

function entriesPart(p: SqlParams, input: ProjectionInput, ids: readonly string[]): CtePart {
  const place = new Map(input.state.finalPlacement.map((f) => [f.accountId, f.place]));
  const rows = ids.flatMap((id) => {
    const player = input.state.players[id];
    return player === undefined ? [] : [{ id, player }];
  });
  const sql = `UPDATE sbr.match_entries e SET score = u.score, state = u.state,
       eliminated_at_round = u.out_round, shield_charges = u.shield,
       seasons_activated = u.seasons, final_place = u.place
     FROM v, unnest(${p.add(rows.map((r) => r.id))}::text[], ${p.add(rows.map((r) => r.player.points))}::bigint[],
          ${p.add(rows.map((r) => (r.player.eliminatedAtRound === null ? 'active' : 'eliminated')))}::text[],
          ${p.add(rows.map((r) => r.player.eliminatedAtRound))}::int[],
          ${p.add(rows.map((r) => r.player.effects.shieldCharges))}::int[],
          ${p.add(rows.map((r) => r.player.effects.seasonsActivated))}::smallint[],
          ${p.add(rows.map((r) => place.get(r.id) ?? null))}::int[])
       AS u(player_id, score, state, out_round, shield, seasons, place)
     WHERE e.match_id = v.id AND e.player_id = u.player_id`;
  return { name: 'entries', sql };
}

// Rank by points among all players, ties by join order (display only; cuts use the domain).
// Only the touched players' rows: a mark rewrites the marking player's row (others' ranks
// follow at the next round end, cut, stage or finish, which touch everyone). The load check
// of 2026-11-04: 64 marks a draw each rewriting 200 rows held up the match's draws.
function standingsPart(p: SqlParams, input: ProjectionInput, touched: readonly string[]): CtePart {
  const write = new Set(touched);
  const ranked = [...input.state.playerOrder].sort(
    (a, b) => (input.state.players[b]?.points ?? 0) - (input.state.players[a]?.points ?? 0),
  );
  const rows = ranked.flatMap((id, i) => (write.has(id) ? [{ id, rank: i + 1 }] : []));
  const sql = `INSERT INTO sbr.standings (match_id, player_id, rank, score, seasons, updated_seq)
     SELECT v.id, u.player_id, u.rank, u.score, u.seasons, ${p.add(input.seq)}
       FROM v, unnest(${p.add(rows.map((r) => r.id))}::text[],
            ${p.add(rows.map((r) => input.state.players[r.id]?.points ?? 0))}::bigint[],
            ${p.add(rows.map((r) => input.state.players[r.id]?.effects.seasonsActivated ?? 0))}::smallint[],
            ${p.add(rows.map((r) => r.rank))}::int[])
         AS u(player_id, score, seasons, rank)
     ON CONFLICT (match_id, player_id) DO UPDATE
       SET rank = EXCLUDED.rank, score = EXCLUDED.score, seasons = EXCLUDED.seasons,
           updated_seq = EXCLUDED.updated_seq`;
  return { name: 'standings', sql };
}

function marksPart(p: SqlParams, input: ProjectionInput): CtePart[] {
  const round = input.state.currentRound;
  const marks = input.events.flatMap((e) => (e.type === 'cellMarked' ? [e] : []));
  if (round === null || marks.length === 0) return [];
  const drawIndexOf = (m: (typeof marks)[number]): number | null => {
    const cell = round.cards[m.accountId]?.[m.cardIndex]?.card.cells[m.cellIndex];
    return cell === undefined || cell.kind === 'free' ? null : round.draws.indexOf(cell.value);
  };
  const manual = input.mark?.source === 'manual';
  const bonusOf = (m: (typeof marks)[number]): number =>
    input.mark?.speedBonuses?.get(markKey(m.accountId, m.cardIndex, m.cellIndex)) ?? 0;
  const sql = `INSERT INTO sbr.marks (match_id, player_id, round_index, card_index, cell, draw_index, source, speed_bonus)
     SELECT v.id, u.player_id, ${p.add(round.roundIndex)}, u.card_index, u.cell, u.draw_index, ${p.add(manual ? 'manual' : 'auto')}, u.speed_bonus
       FROM v, unnest(${p.add(marks.map((m) => m.accountId))}::text[], ${p.add(marks.map((m) => m.cardIndex))}::smallint[],
            ${p.add(marks.map((m) => m.cellIndex))}::smallint[], ${p.add(marks.map(drawIndexOf))}::smallint[],
            ${p.add(marks.map(bonusOf))}::smallint[])
         AS u(player_id, card_index, cell, draw_index, speed_bonus)
     ON CONFLICT DO NOTHING`;
  return [{ name: 'marks', sql }];
}
