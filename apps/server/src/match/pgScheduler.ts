/**
 * @file   apps/server/src/match/pgScheduler.ts
 * @module server/match
 * @brief  PgScheduler: timed match commands as rows in scheduled_actions (02 §5.3).
 *
 * Responsibility: `schedule` and `cancel` implement the engine's Scheduler port. The loop
 *                 polls every 250 ms, claims due rows with FOR UPDATE SKIP LOCKED and a
 *                 30-second lease (safe with several instances), runs each through the
 *                 engine in due order, and marks it done. A failing action is retried up to
 *                 five times with a growing delay. Because pending work lives in the
 *                 database, a restarted server continues every match where it stopped. The
 *                 payload keeps a draw index and an async draw's planned time (catch-up, 06
 *                 §6); `runNextFor` steps one match for the development time travel.
 * Depends on:     @sbr/application (types), ../db/pool
 * Used by:        ./runtime, ../dev/devClock, ../http/routes/timeTravel
 * Spec:           docs/spec/02-software-architecture.md §5.3; docs/spec/04-database-design.md §3.3
 */
import { randomUUID } from 'node:crypto';

import type { ActionKind, ScheduledAction, Scheduler } from '@sbr/application';

import type { DbPool } from '../db/pool.js';

const POLL_MS = 250;
const MAX_ATTEMPTS = 5;

interface ActionRow {
  id: string;
  match_id: string;
  kind: ActionKind;
  payload: { drawIndex?: number; plannedAt?: number };
  due_at: Date;
  attempts: number;
}

export class PgScheduler implements Scheduler {
  private readonly owner = `sbr-${randomUUID()}`;
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;

  constructor(private readonly pool: DbPool) {}

  async schedule(action: ScheduledAction): Promise<void> {
    const payload = {
      ...(action.drawIndex === undefined ? {} : { drawIndex: action.drawIndex }),
      ...(action.plannedAt === undefined ? {} : { plannedAt: action.plannedAt }),
    };
    await this.pool.query(
      `INSERT INTO sbr.scheduled_actions (match_id, kind, payload, due_at)
       VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))`,
      [action.matchId, action.kind, JSON.stringify(payload), action.dueAt],
    );
  }

  async cancel(matchId: string, kind?: ActionKind): Promise<void> {
    await this.pool.query(
      `UPDATE sbr.scheduled_actions SET done_at = now()
       WHERE match_id = $1 AND done_at IS NULL AND ($2::text IS NULL OR kind = $2)`,
      [matchId, kind ?? null],
    );
  }

  start(run: (action: ScheduledAction) => Promise<void>): void {
    const tick = (): void => {
      this.running = this.runDue(run)
        .catch((error: unknown) => {
          console.error('[sbr] scheduler tick failed:', error);
        })
        .finally(() => {
          if (this.timer !== null) this.timer = setTimeout(tick, POLL_MS);
        });
    };
    this.timer = setTimeout(tick, POLL_MS);
  }

  async stop(): Promise<void> {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    await this.running;
  }

  // Claims every due action (leases expire after 30 s, so a crashed instance's work is
  // picked up again) and runs them one by one in due order.
  private async runDue(run: (action: ScheduledAction) => Promise<void>): Promise<void> {
    const claimed = await this.pool.query<ActionRow>(
      `UPDATE sbr.scheduled_actions SET lease_owner = $1, lease_until = now() + interval '30 seconds'
       WHERE id IN (
         SELECT id FROM sbr.scheduled_actions
         WHERE done_at IS NULL AND due_at <= now() AND (lease_until IS NULL OR lease_until < now())
         ORDER BY due_at, id LIMIT 50 FOR UPDATE SKIP LOCKED)
       RETURNING id, match_id, kind, payload, due_at, attempts`,
      [this.owner],
    );
    const rows = [...claimed.rows].sort(
      (a, b) => a.due_at.getTime() - b.due_at.getTime() || Number(a.id) - Number(b.id),
    );
    for (const row of rows) await this.runOne(row, run);
  }

  // Development time travel (../dev/devClock): claims the earliest pending action of one
  // match due by `until` (epoch ms) and runs it as the loop would; null when none is left.
  async runNextFor(
    matchId: string,
    until: number,
    run: (action: ScheduledAction) => Promise<void>,
  ): Promise<ScheduledAction | null> {
    const claimed = await this.pool.query<ActionRow>(
      `UPDATE sbr.scheduled_actions SET lease_owner = $1, lease_until = now() + interval '30 seconds'
       WHERE id = (
         SELECT id FROM sbr.scheduled_actions
         WHERE match_id = $2 AND done_at IS NULL AND due_at <= to_timestamp($3 / 1000.0)
           AND (lease_until IS NULL OR lease_until < now())
         ORDER BY due_at, id LIMIT 1 FOR UPDATE SKIP LOCKED)
       RETURNING id, match_id, kind, payload, due_at, attempts`,
      [this.owner, matchId, until],
    );
    const row = claimed.rows[0];
    if (row === undefined) return null;
    await this.runOne(row, run);
    return actionOf(row);
  }

  private async runOne(
    row: ActionRow,
    run: (action: ScheduledAction) => Promise<void>,
  ): Promise<void> {
    const action = actionOf(row);
    try {
      await run(action);
      await this.pool.query('UPDATE sbr.scheduled_actions SET done_at = now() WHERE id = $1', [
        row.id,
      ]);
    } catch (error) {
      const attempts = row.attempts + 1;
      console.error(
        `[sbr] action ${row.kind} for ${row.match_id} failed (${String(attempts)}):`,
        error,
      );
      await this.pool.query(
        `UPDATE sbr.scheduled_actions SET attempts = $2, lease_until = NULL,
           due_at = now() + make_interval(secs => $2),
           done_at = CASE WHEN $2 >= $3 THEN now() END
         WHERE id = $1`,
        [row.id, attempts, MAX_ATTEMPTS],
      );
    }
  }
}

function actionOf(row: ActionRow): ScheduledAction {
  const { drawIndex, plannedAt } = row.payload;
  return {
    matchId: row.match_id,
    kind: row.kind,
    dueAt: row.due_at.getTime(),
    ...(drawIndex === undefined ? {} : { drawIndex }),
    ...(plannedAt === undefined ? {} : { plannedAt }),
  };
}
