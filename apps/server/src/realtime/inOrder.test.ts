/**
 * @file   apps/server/src/realtime/inOrder.test.ts
 * @module server/realtime
 * @brief  Calls run strictly in arrival order, even when an earlier call is slower.
 *
 * Responsibility: an unwatch that takes longer than the watch sent right after it must
 *                 still finish first (the order the client meant), and a failing call does
 *                 not stop the ones after it.
 * Depends on:     ./inOrder
 * Spec:           docs/spec/06-realtime-architecture.md §4.1
 */
import { describe, expect, it } from 'vitest';

import { inOrder } from './inOrder.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('inOrder', () => {
  it('finishes a slow earlier call before a fast later one starts', async () => {
    const log: string[] = [];
    const run = inOrder(async (name: string, ms: number) => {
      log.push(`start ${name}`);
      await sleep(ms);
      log.push(`end ${name}`);
    });
    await Promise.all([run('unwatch', 30), run('watch', 1)]);
    expect(log).toEqual(['start unwatch', 'end unwatch', 'start watch', 'end watch']);
  });

  it('keeps going after a failing call', async () => {
    const log: string[] = [];
    const run = inOrder(async (name: string) => {
      await sleep(1);
      if (name === 'bad') throw new Error('boom');
      log.push(name);
    });
    await Promise.all([run('bad'), run('good')]);
    expect(log).toEqual(['good']);
  });
});
