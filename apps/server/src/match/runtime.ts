/**
 * @file   apps/server/src/match/runtime.ts
 * @module server/match
 * @brief  Wires the live match engine to PostgreSQL, the scheduler and the event bus.
 *
 * Responsibility: build the store, scheduler, bus and engine for one server process;
 *                 seeds come from the CSPRNG (01 §9), match codes are six characters
 *                 without look-alikes. `startScheduler` begins running due actions; the
 *                 caller stops it on shutdown.
 * Depends on:     node:crypto, @sbr/application, ./pgMatchStore, ./pgScheduler, ./eventBus
 * Used by:        ../http/app
 * Spec:           docs/spec/02-software-architecture.md §5; docs/spec/01-game-design.md §9
 */
import { randomBytes, randomInt } from 'node:crypto';

import { MatchEngine } from '@sbr/application';
import { SEED_BYTES } from '@sbr/domain';

import type { DbPool } from '../db/pool.js';
import { LocalEventBus } from './eventBus.js';
import { PgMatchStore } from './pgMatchStore.js';
import { PgScheduler } from './pgScheduler.js';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export interface MatchRuntime {
  readonly engine: MatchEngine;
  readonly store: PgMatchStore;
  readonly scheduler: PgScheduler;
  readonly bus: LocalEventBus;
  startScheduler(): void;
}

export function createMatchRuntime(pool: DbPool, seedKey: Buffer): MatchRuntime {
  const store = new PgMatchStore(pool, seedKey);
  const scheduler = new PgScheduler(pool);
  const bus = new LocalEventBus();
  const engine = new MatchEngine({
    store,
    scheduler,
    bus,
    clock: { now: () => Date.now() },
    randomSeed: () => new Uint8Array(randomBytes(SEED_BYTES)),
    randomCode: () =>
      Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join(''),
  });
  return {
    engine,
    store,
    scheduler,
    bus,
    startScheduler: () => {
      scheduler.start((action) => engine.handle(action));
    },
  };
}
