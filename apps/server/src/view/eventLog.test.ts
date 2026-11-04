/**
 * @file   apps/server/src/view/eventLog.test.ts
 * @module server/view
 * @brief  The shared event log: 200 away summaries at once read a match's log once (12 §5).
 *
 * Responsibility: concurrent requests up to the same seq share one read of the log; a later
 *                 request reads only the events after what is held; events above the asked seq
 *                 are left out. (The load check of 2026-11-04: 200 players' summaries after a
 *                 day each decoded the whole log, 64 s p95.)
 * Depends on:     vitest, @sbr/application (types), ./eventLog
 * Spec:           docs/spec/06-realtime-architecture.md §6; docs/spec/12-testing-strategy.md §5
 */
import type { StoredEvent } from '@sbr/application';
import { describe, expect, it } from 'vitest';

import { EventLogCache } from './eventLog.js';

const event = (seq: number): StoredEvent =>
  ({ seq, occurredAt: seq, event: { type: 'drawMade' } }) as unknown as StoredEvent;

describe('the shared event log', () => {
  it('reads the log once for concurrent requests, then only the tail', async () => {
    let log = [1, 2, 3].map(event);
    const reads: number[] = [];
    const cache = new EventLogCache((_id, after) => {
      reads.push(after);
      return Promise.resolve(log.filter((e) => e.seq > after));
    });
    const [a, b] = await Promise.all([cache.upTo('m', 3), cache.upTo('m', 3)]);
    expect(reads).toEqual([0]);
    expect(a.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(b).toBe(a);
    log = [1, 2, 3, 4, 5].map(event);
    expect((await cache.upTo('m', 4)).map((e) => e.seq)).toEqual([1, 2, 3, 4]);
    expect(reads).toEqual([0, 3]);
  });
});
