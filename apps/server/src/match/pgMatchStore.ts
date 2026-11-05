/**
 * @file   apps/server/src/match/pgMatchStore.ts
 * @module server/match
 * @brief  PostgreSQL adapter of the match store: event log, snapshots, projections (02 §5.2).
 *
 * Responsibility: insert a match (seed encrypted and bound to the match id, commitment public;
 *                 mode, time zone and quiet hours of async matches);
 *                 check at startup that the seed key opens what is stored; write and read events
 *                 and snapshots in the codec's stored encoding; load a match from its latest
 *                 snapshot plus the event tail, with the current round's draw times; append a
 *                 batch (./appendBatch: one statement, or one transaction with a join, the finish
 *                 or a snapshot; version check on the matches row, consecutive seq, projections;
 *                 a snapshot with a draw at least 25 events after the last), reporting its round
 *                 trips; set the status, draw control and start rule (D16) on the row.
 * Depends on:     pg, @sbr/domain, @sbr/application (ports), ./codec, ./appendBatch, ./records,
 *                 ../db/pool
 * Used by:        ../http/routes/matches, ../http/routes/matchVerify, ./runtime
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
import {
  decodeStored,
  encodeStored,
  encryptSeed,
  openSeedColumn,
  SEED_COLUMN_VERSION,
  type SeedColumn,
} from './codec.js';
import { appendBatch } from './appendBatch.js';
import { recordFrom, type MatchRow } from './records.js';

// A snapshot of the whole state with a draw, at least 25 events after the last one: at most
// one per draw. Every 25 events wrote three or four sealed snapshots per draw when 200 players
// tapped (load check of 2026-11-04), which held up the match's queue.
const SNAPSHOT_EVERY = 25;
const snapshotDue = (events: readonly DomainEvent[], seq: number, last: number): boolean =>
  seq - last >= SNAPSHOT_EVERY && events.some((e) => e.type === 'drawMade');

export { VersionConflict } from './appendBatch.js';

// What one append took (the metrics of 12 §5): its round trips, its time, whether it was taps.
export interface AppendTiming {
  readonly roundTrips: number;
  readonly ms: number;
  readonly taps: boolean;
}

export class PgMatchStore implements MatchStore {
  // Each match's latest snapshot seq, from its load and each snapshot written.
  private readonly snapshotAt = new Map<string, number>();

  constructor(
    private readonly pool: DbPool,
    private readonly seedKey: Buffer,
    private readonly onAppend: (timing: AppendTiming) => void = () => undefined,
  ) {}

  // At startup: the key must open what is stored (the newest sealed seed), so a wrong key
  // stops the server at once instead of failing on the first match it loads. No secret is
  // named in the error.
  async checkKey(): Promise<void> {
    const r = await this.pool.query<SeedColumn>(
      'SELECT id, seed_enc, seed_enc_version FROM sbr.matches ORDER BY created_at DESC LIMIT 1',
    );
    const newest = r.rows[0];
    if (newest === undefined) return;
    try {
      openSeedColumn(newest, this.seedKey);
    } catch {
      throw new Error('SBR_SEED_KEY does not open the stored match secrets (wrong key?)');
    }
  }

  async insert(r: NewMatchRecord): Promise<void> {
    const s = r.settings;
    await this.pool.query(
      `INSERT INTO sbr.matches (id, code, title, game_type, ruleset_name, ruleset, max_players,
         seed_commitment, seed_enc, prizes, counts_for_leaderboard, marking_mode, draw_mode,
         missed_numbers, auto_mark_delay_ms, draw_interval_ms, created_by, round_pause_ms,
         start_rule, start_at, start_auto, seed_enc_version, mode, timezone, quiet_start_hour,
         quiet_end_hour, lobby_closes_at, show_on_website)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
         $23,$24,$25,$26,$27,$28)`,
      [
        r.id,
        r.code,
        r.title,
        r.gameType,
        r.rulesetName,
        JSON.stringify(r.ruleset),
        r.maxPlayers,
        Buffer.from(commitSeed(r.seed)),
        // Sealed for this match only (AAD), and marked so (./codec SEED_COLUMN_VERSION).
        encryptSeed(r.seed, this.seedKey, r.id),
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
        SEED_COLUMN_VERSION,
        r.ruleset.mode,
        s.timeZone,
        s.quietHours?.startHour ?? null,
        s.quietHours?.endHour ?? null,
        r.lobbyClosesAt === null ? null : new Date(r.lobbyClosesAt),
        r.showOnWebsite,
      ],
    );
  }

  async setShowOnWebsite(matchId: string, show: boolean): Promise<void> {
    await this.pool.query('UPDATE sbr.matches SET show_on_website = $2 WHERE id = $1', [
      matchId,
      show,
    ]);
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
      base === undefined
        ? createInitialMatchState()
        : (decodeStored(base.state, this.seedKey, matchId) as MatchState);
    let seq = base === undefined ? 0 : Number(base.seq);
    this.snapshotAt.set(matchId, seq);
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
      event: decodeStored(r.payload, this.seedKey, matchId) as DomainEvent,
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

  // The batch in one statement (taps, draws, window closes) or one transaction (a join, the
  // finish, a snapshot): ./appendBatch. A stale version raises VersionConflict.
  async append(input: AppendInput): Promise<readonly StoredEvent[]> {
    const started = Date.now();
    const lastSeq = input.expectedSeq + input.events.length;
    const stored = input.events.map((event, i) => ({
      seq: input.expectedSeq + i + 1,
      event,
      occurredAt: input.at,
    }));
    const encode = (value: object): string => encodeStored(value, this.seedKey, input.matchId);
    const due = snapshotDue(input.events, lastSeq, this.snapshotAt.get(input.matchId) ?? 0);
    const roundTrips = await appendBatch(this.pool, {
      ...input,
      stored,
      payloads: stored.map((s) => encode(s.event)),
      snapshot: due ? encode(input.stateAfter) : null,
    });
    if (due) this.snapshotAt.set(input.matchId, lastSeq);
    this.onAppend({ roundTrips, ms: Date.now() - started, taps: input.mark?.source === 'manual' });
    return stored;
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
