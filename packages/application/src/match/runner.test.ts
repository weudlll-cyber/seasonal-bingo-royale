/**
 * @file   packages/application/src/match/runner.test.ts
 * @module application/match
 * @brief  A load that finishes late never puts an older match into the runner's cache.
 *
 * Responsibility: a read (a lobby poll) loads the match while a command is being applied;
 *                 the read's load ends after the command was stored. The next command must
 *                 still append after the newest seq (no version conflict): concurrent loads of
 *                 one match share one load, and the cache keeps the newest seq it saw.
 * Depends on:     vitest, @sbr/domain (types), ./fakes, ./runner, ./ports (types)
 * Spec:           docs/spec/02-software-architecture.md §5.2
 */
import type { Command } from '@sbr/domain';
import { describe, expect, it } from 'vitest';

import { fakeEngine } from './fakes.js';
import type { LoadedMatch } from './ports.js';
import { MatchRunner } from './runner.js';

const join = (accountId: string, joinedAt: number): Command => ({
  type: 'joinMatch',
  accountId,
  joinedAt,
  human: true,
});

describe('the runner cache', () => {
  it('keeps the newest match when a slower load of an older one ends later', async () => {
    const ctx = fakeEngine();
    const m = await ctx.engine.create(
      {
        title: 't',
        gameType: 'royale',
        drawMode: 'host',
        missedNumbers: { kind: 'noAutoMark' },
        maxPlayers: 10,
      },
      null,
    );
    // A fresh process: its runner has nothing cached. Its first load reads the log at once
    // but answers only when released, as a slow query would.
    const bus = { publish: () => undefined, changed: () => undefined };
    const runner = new MatchRunner(ctx.store, bus, ctx.clock);
    const load = ctx.store.load.bind(ctx.store);
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    let first = true;
    ctx.store.load = async (id: string): Promise<LoadedMatch | null> => {
      const now = await load(id);
      if (first) {
        first = false;
        await held;
      }
      return now;
    };
    const poll = runner.current(m.id);
    const joining = runner.apply(m.id, [join('a', ctx.clock.t)]);
    // The poll's load ends only once the join is stored (or has waited for that load).
    await Promise.race([joining, new Promise((resolve) => setTimeout(resolve, 50))]);
    release();
    await Promise.all([poll, joining]);
    await runner.apply(m.id, [join('b', ctx.clock.t)]);
    expect((await runner.current(m.id)).state.playerOrder).toEqual(['a', 'b']);
  });
});
