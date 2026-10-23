/**
 * @file   apps/server/src/match/pgMatchStore.ts
 * @module server/match
 * @brief  PostgreSQL adapter of the match store: event log, snapshots, projections (02 §5.2).
 *
 * Responsibility: insert a match (seed encrypted, commitment public); load a match from
 *                 its latest snapshot plus the event tail, with the draw times of the
 *                 current round; append a batch in one transaction — version check on the
 *                 matches row (optimistic concurrency), events with consecutive seq, the
 *                 projections, and a snapshot every 25 events (the last 3 are kept); set
 *                 the status, the draw control and the start rule (D16) on the row.
 * Depends on:     pg, @sbr/domain, @sbr/application (ports), ./codec, ./projections, ./records,
 *                 ../db/pool
 * Used by:        ../http/routes/matches, ./runtime
 * Spec:           docs/spec/02-software-architecture.md §5.2; docs/spec/04-database-design.md §3.3
 */
import type {
  AppendInput,
  DrawMode,
  LoadedMatch,
  MatchStatus,
  MatchStore,
  NewMatchRecord,
  StartRule,
  StoredEvent,
} from '@sbr/application';
import {
  commitSeed,
  createInitialMatchState,
  evolve,
  type DomainEvent,
  type MatchState,
} from '@sbr/domain';

import type { DbPool } from '../db/pool.js';
import { encryptSeed, fromJson, toJson } from './codec.js';
import { project } from './projections.js';
import { recordFrom, type MatchRow } from './records.js';

const SNAPSHOT_EVERY = 25;

export class VersionConflict extends Error {}

export class PgMatchStore implements MatchStore {
  constructor(
    private readonly pool: DbPool,
    private readonly seedKey: Buffer,
  ) {}

  async insert(r: NewMatchRecord): Promise<void> {
    const s = r.settings;
    await this.pool.query(
      `INSERT INTO sbr.matches (id, code, title, game_type, ruleset_name, ruleset, max_players,
         seed_commitment, seed_enc, prizes, counts_for_leaderboard, marking_mode, draw_mode,
         missed_numbers, auto_mark_delay_ms, draw_interval_ms, created_by, round_pause_ms,
         start_rule, start_at, start_auto)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
      [
        r.id,
        r.code,
        r.title,
        r.gameType,
        r.rulesetName,
        JSON.stringify(r.ruleset),
        r.maxPlayers,
        Buffer.from(commitSeed(r.seed)),
        encryptSeed(r.seed, this.seedKey),
        r.prizes,
        r.countsForLeaderboard,
        s.markingMode,
        s.drawMode,
        s.missedNumbers.kind,
        s.missedNumbers.kind === 'autoMarkAfter' ? s.missedNumbers.delayMs : 3000,
        s.drawIntervalMs,
        r.createdBy,
        s.roundPause.kind === 'wait' ? s.roundPause.ms : null,
        s.startRule.kind,
        // The announced time is in the row from the start, so a load reads the rule back.
        s.startRule.kind === 'at' ? new Date(s.startRule.at) : null,
        s.startRule.kind === 'at' && s.startRule.auto,
      ],
    );
  }

  async load(matchId: string): Promise<LoadedMatch | null> {
    const row = await this.pool.query<MatchRow>('SELECT * FROM sbr.matches WHERE id = $1', [
      matchId,
    ]);
    const match = row.rows[0];
    if (match === undefined) return null;
    const snap = await this.pool.query<{ seq: string; state: unknown }>(
      'SELECT seq, state FROM sbr.match_snapshots WHERE match_id = $1 ORDER BY seq DESC LIMIT 1',
      [matchId],
    );
    const base = snap.rows[0];
    let state =
      base === undefined ? createInitialMatchState() : (fromJson(base.state) as MatchState);
    let seq = base === undefined ? 0 : Number(base.seq);
    for (const e of await this.events(matchId, seq)) {
      state = evolve(state, e.event);
      seq = e.seq;
    }
    return { record: recordFrom(match), state, seq, drawTimes: await this.drawTimes(matchId) };
  }

  // Events after `afterSeq`, in order.
  async events(matchId: string, afterSeq: number): Promise<readonly StoredEvent[]> {
    const result = await this.pool.query<{ seq: string; payload: unknown; occurred_at: Date }>(
      'SELECT seq, payload, occurred_at FROM sbr.match_events WHERE match_id = $1 AND seq > $2 ORDER BY seq',
      [matchId, afterSeq],
    );
    return result.rows.map((r) => ({
      seq: Number(r.seq),
      event: fromJson(r.payload) as DomainEvent,
      occurredAt: r.occurred_at.getTime(),
    }));
  }

  private async drawTimes(matchId: string): Promise<readonly number[]> {
    const result = await this.pool.query<{ occurred_at: Date }>(
      `SELECT occurred_at FROM sbr.match_events WHERE match_id = $1 AND type = 'drawMade'
         AND seq > COALESCE((SELECT max(seq) FROM sbr.match_events
                             WHERE match_id = $1 AND type = 'roundStarted'), 0)
       ORDER BY seq`,
      [matchId],
    );
    return result.rows.map((r) => r.occurred_at.getTime());
  }

  async append(input: AppendInput): Promise<readonly StoredEvent[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const v = await client.query<{ version: string }>(
        'SELECT version FROM sbr.matches WHERE id = $1 FOR UPDATE',
        [input.matchId],
      );
      if (Number(v.rows[0]?.version ?? -1) !== input.expectedSeq)
        throw new VersionConflict(input.matchId);
      const stored = input.events.map((event, i) => ({
        seq: input.expectedSeq + i + 1,
        event,
        occurredAt: input.at,
      }));
      await client.query(
        `INSERT INTO sbr.match_events (match_id, seq, type, payload, occurred_at, actor_account_id)
         SELECT $1, u.seq, u.type, u.payload::jsonb, to_timestamp($5 / 1000.0), $6
           FROM unnest($2::bigint[], $3::text[], $4::text[]) AS u(seq, type, payload)`,
        [
          input.matchId,
          stored.map((s) => s.seq),
          stored.map((s) => s.event.type),
          stored.map((s) => toJson(s.event)),
          input.at,
          input.actorAccountId,
        ],
      );
      const lastSeq = input.expectedSeq + input.events.length;
      await client.query('UPDATE sbr.matches SET version = $2 WHERE id = $1', [
        input.matchId,
        lastSeq,
      ]);
      await project(client, { ...input, state: input.stateAfter, seq: lastSeq, mark: input.mark });
      if (Math.floor(lastSeq / SNAPSHOT_EVERY) > Math.floor(input.expectedSeq / SNAPSHOT_EVERY)) {
        await snapshot(client, input.matchId, lastSeq, input.stateAfter);
      }
      await client.query('COMMIT');
      return stored;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async setStatus(
    matchId: string,
    status: MatchStatus,
    extra: { startsAt?: number } = {},
  ): Promise<void> {
    await this.pool.query(
      `UPDATE sbr.matches SET status = $2,
         starts_at = COALESCE(to_timestamp($3 / 1000.0), starts_at),
         started_at = CASE WHEN $2 = 'running' THEN now() ELSE started_at END,
         finished_at = CASE WHEN $2 IN ('finished', 'aborted') THEN now() ELSE finished_at END
       WHERE id = $1`,
      [matchId, status, extra.startsAt ?? null],
    );
  }

  async setDrawControl(matchId: string, drawMode: DrawMode, drawIntervalMs: number): Promise<void> {
    await this.pool.query(
      'UPDATE sbr.matches SET draw_mode = $2, draw_interval_ms = $3 WHERE id = $1',
      [matchId, drawMode, drawIntervalMs],
    );
  }

  async setStartRule(matchId: string, rule: StartRule): Promise<void> {
    await this.pool.query(
      'UPDATE sbr.matches SET start_rule = $2, start_at = $3, start_auto = $4 WHERE id = $1',
      [
        matchId,
        rule.kind,
        rule.kind === 'at' ? new Date(rule.at) : null,
        rule.kind === 'at' && rule.auto,
      ],
    );
  }
}

async function snapshot(
  client: { query: (q: string, v: unknown[]) => Promise<unknown> },
  matchId: string,
  seq: number,
  state: MatchState,
): Promise<void> {
  await client.query(
    'INSERT INTO sbr.match_snapshots (match_id, seq, state) VALUES ($1, $2, $3::jsonb)',
    [matchId, seq, toJson(state)],
  );
  await client.query(
    `DELETE FROM sbr.match_snapshots WHERE match_id = $1 AND seq NOT IN
       (SELECT seq FROM sbr.match_snapshots WHERE match_id = $1 ORDER BY seq DESC LIMIT 3)`,
    [matchId],
  );
}
