/**
 * @file   apps/server/src/match/runtime.ts
 * @module server/match
 * @brief  Wires the live match engine to PostgreSQL, the scheduler and the event bus.
 *
 * Responsibility: build the store, scheduler, bus and engine for one server process (the
 *                 system clock, or the development time-travel clock);
 *                 seeds come from the CSPRNG (01 §9), match codes are six characters
 *                 without look-alikes. `startScheduler` first continues every running match
 *                 that stopped between a round end and its next step (audit H2), then
 *                 begins running due actions; the caller stops it on shutdown.
 * Depends on:     @sbr/application, ./pgMatchStore, ./pgScheduler, ./eventBus, @sbr/domain,
 *                 ../db/pool
 * Used by:        ../http/app
 * Spec:           docs/spec/02-software-architecture.md §5; docs/spec/01-game-design.md §9
 */
import { randomBytes, randomInt } from 'node:crypto';

import {
  MatchEngine,
  type Clock,
  type MaintenanceReader,
  type TapBatchTiming,
} from '@sbr/application';
import { SEED_BYTES } from '@sbr/domain';

import type { DbPool } from '../db/pool.js';
import { LocalEventBus } from './eventBus.js';
import { PgMatchStore, type AppendTiming } from './pgMatchStore.js';
import { PgScheduler } from './pgScheduler.js';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export interface MatchRuntime {
  readonly engine: MatchEngine;
  readonly store: PgMatchStore;
  readonly scheduler: PgScheduler;
  readonly bus: LocalEventBus;
  // Resolves with the running matches that could not be continued.
  startScheduler(): Promise<readonly string[]>;
}

const SYSTEM_CLOCK: Clock = { now: () => Date.now() };

// `maintenance` holds the automatic starts while `sbr maintenance on` is set (D22);
// development builds pass their time-travel clock (../dev/devClock); `onTapBatch` and `onAppend` feed the
// tap breakdown of the metrics (12 §5).
export function createMatchRuntime(
  pool: DbPool,
  seedKey: Buffer,
  maintenance: MaintenanceReader,
  options: {
    readonly clock?: Clock | undefined;
    readonly onTapBatch?: (batch: TapBatchTiming) => void;
    // Each stored batch's round trips and time (the metrics, 12 §5).
    readonly onAppend?: (timing: AppendTiming) => void;
    // League points need confirmed e-mail addresses (D59; default true).
    readonly leagueNeedsVerifiedEmail?: boolean;
  } = {},
): MatchRuntime {
  const clock = options.clock ?? SYSTEM_CLOCK;
  const onTapBatch = options.onTapBatch;
  const store = new PgMatchStore(
    pool,
    seedKey,
    options.onAppend,
    options.leagueNeedsVerifiedEmail ?? true,
  );
  const scheduler = new PgScheduler(pool);
  const bus = new LocalEventBus();
  const engine = new MatchEngine({
    store,
    scheduler,
    bus,
    clock,
    maintenance,
    ...(onTapBatch === undefined ? {} : { onTapBatch }),
    randomSeed: () => new Uint8Array(randomBytes(SEED_BYTES)),
    randomCode: () =>
      Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join(''),
  });
  return {
    engine,
    store,
    scheduler,
    bus,
    startScheduler: async () => {
      const failed = await recoverRunning(pool, engine);
      scheduler.start((action) => engine.handle(action));
      return failed;
    },
  };
}

// One broken match does not keep the others (or the server) from starting.
async function recoverRunning(pool: DbPool, engine: MatchEngine): Promise<string[]> {
  const running = await pool.query<{ id: string }>(
    `SELECT id FROM sbr.matches WHERE status = 'running'`,
  );
  const failed: string[] = [];
  for (const { id } of running.rows) {
    await engine.recover(id).catch(() => failed.push(id));
  }
  return failed;
}
