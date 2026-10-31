/**
 * @file   packages/application/src/match/recovery.test.ts
 * @module application/match
 * @brief  A crash between the steps after a round end does not stall the match (audit H2).
 *
 * Responsibility: the store fails once while a royale round ends (at its cut, or at the
 *                 pause that follows); the scheduler's retry of the window close, or a
 *                 restarted engine's start-up sweep (`recover`), continues the match, which
 *                 then plays the same events as a run without the failure.
 * Depends on:     @sbr/domain, ./engine, ./fakes, ./ports
 * Spec:           docs/spec/02-software-architecture.md §5.3; docs/spec/01-game-design.md §7
 */
import type { DomainEvent } from '@sbr/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MatchEngine } from './engine.js';
import { fakeEngine } from './fakes.js';
import type { AppendInput, ScheduledAction } from './ports.js';

const royale = {
  title: 't',
  gameType: 'royale' as const,
  drawMode: 'auto' as const,
  missedNumbers: { kind: 'autoMarkAfter' as const, delayMs: 3_000 },
  roundPause: { kind: 'wait' as const, ms: 4_000 },
  maxPlayers: 20,
};

afterEach(() => {
  vi.restoreAllMocks();
});

// A started royale match with bots, always with the same id so every run plays the same
// cards; `failOn` makes the store fail once on the first append that carries that event.
async function started(failOn: DomainEvent['type'] | null) {
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');
  const f = fakeEngine();
  const append = f.store.append.bind(f.store);
  let armed = failOn !== null;
  f.store.append = (input: AppendInput) => {
    if (armed && input.events.some((e) => e.type === failOn)) {
      armed = false;
      return Promise.reject(new Error('crash'));
    }
    return append(input);
  };
  const m = await f.engine.create(royale, null);
  await f.engine.join(m.id, 'person', true);
  await f.engine.fillWithBots(m.id, 20);
  await f.engine.start(m.id, 1_000);
  return { ...f, id: m.id };
}

// Runs due actions until one fails; returns the failed action (it stays pending, as in
// PgScheduler).
async function runToFailure(f: Awaited<ReturnType<typeof started>>): Promise<ScheduledAction> {
  for (;;) {
    const next = [...f.scheduler.pending].sort((a, b) => a.dueAt - b.dueAt)[0];
    if (next === undefined) throw new Error('the match ended without the failure');
    f.scheduler.pending.splice(f.scheduler.pending.indexOf(next), 1);
    f.clock.t = Math.max(f.clock.t, next.dueAt);
    try {
      await f.engine.handle(next);
    } catch {
      return next;
    }
  }
}

async function baseline(): Promise<readonly string[]> {
  const f = await started(null);
  await f.scheduler.runUntil(f.engine, f.clock, Number.POSITIVE_INFINITY);
  return f.store.types(f.id);
}

describe('a crash after a round end (audit H2)', () => {
  it('cuts the round and continues when the window close is retried', async () => {
    const expected = await baseline();
    const f = await started('cutApplied');
    const failed = await runToFailure(f);
    expect(failed.kind).toBe('close_speed_window');
    f.scheduler.pending.push(failed);
    await f.scheduler.runUntil(f.engine, f.clock, Number.POSITIVE_INFINITY);
    expect(f.store.types(f.id)).toEqual(expected);
    expect(f.store.records.get(f.id)?.status).toBe('finished');
  });

  it('schedules the next round when a restarted engine recovers the match', async () => {
    const expected = await baseline();
    const f = await started('nextRoundScheduled');
    await runToFailure(f);
    // The restart: a new engine on the same store and scheduler, nothing in memory.
    const restarted = new MatchEngine({
      store: f.store,
      scheduler: f.scheduler,
      bus: { publish: () => undefined, changed: () => undefined },
      clock: f.clock,
      maintenance: () => null,
      randomSeed: () => new Uint8Array(32).fill(7),
      randomCode: () => 'CODE2',
    });
    await restarted.recover(f.id);
    await f.scheduler.runUntil(restarted, f.clock, Number.POSITIVE_INFINITY);
    expect(f.store.types(f.id)).toEqual(expected);
    expect(f.store.records.get(f.id)?.status).toBe('finished');
  });
});
