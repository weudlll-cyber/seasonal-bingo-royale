/**
 * @file   apps/server/src/view/playerNames.test.ts
 * @module server/view
 * @brief  The gateway's display-name cache: per match, from the match entries, expiring.
 *
 * Responsibility: names come from one load per match (the match's own entries); a batch
 *                 whose ids are all known within the lifetime is served from the cache; an
 *                 unknown id (a player who just joined) or an expired entry loads again, so
 *                 a deleted account's new name shows; the cache holds a bounded number of
 *                 matches, the oldest leaves first.
 * Depends on:     ./playerNames
 * Spec:           docs/spec/06-realtime-architecture.md §4; docs/spec/03-security-architecture.md §11
 */
import { describe, expect, it } from 'vitest';

import { PlayerNameCache } from './playerNames.js';

// A loader over a table of names per match that counts its loads, and a settable clock.
function setup(maxMatches = 10) {
  const table: Record<string, Record<string, string>> = {
    m1: { a1: 'ann', 'bot-01': 'bot-01' },
    m2: { b1: 'bob' },
  };
  const loads: string[] = [];
  let now = 0;
  const cache = new PlayerNameCache(
    (matchId) => {
      loads.push(matchId);
      return Promise.resolve({ ...table[matchId] });
    },
    { ttlMs: 30_000, maxMatches, now: () => now },
  );
  return {
    table,
    loads,
    cache,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('player name cache (gateway frames)', () => {
  it('loads a match once and serves known ids from the cache', async () => {
    const t = setup();
    expect(await t.cache.namesFor('m1', ['a1'])).toEqual(
      new Map([
        ['a1', 'ann'],
        ['bot-01', 'bot-01'],
      ]),
    );
    await t.cache.namesFor('m1', ['a1', 'bot-01']);
    expect(t.loads).toEqual(['m1']);
  });

  it('names only the players of that match', async () => {
    const t = setup();
    const names = await t.cache.namesFor('m2', ['a1', 'b1']);
    expect(names.get('b1')).toBe('bob');
    expect(names.has('a1')).toBe(false);
  });

  it('loads again for an id it does not know yet, and once the lifetime is over', async () => {
    const t = setup();
    await t.cache.namesFor('m1', ['a1']);
    t.table['m1'] = { ...t.table['m1'], a2: 'amy' };
    expect((await t.cache.namesFor('m1', ['a2'])).get('a2')).toBe('amy');
    t.table['m1'] = { ...t.table['m1'], a1: 'deleted player 1f2e' };
    t.advance(29_999);
    expect((await t.cache.namesFor('m1', ['a1'])).get('a1')).toBe('ann');
    t.advance(1);
    expect((await t.cache.namesFor('m1', ['a1'])).get('a1')).toBe('deleted player 1f2e');
    expect(t.loads).toEqual(['m1', 'm1', 'm1']);
  });

  it('keeps at most the given number of matches, dropping the oldest', async () => {
    const t = setup(1);
    await t.cache.namesFor('m1', ['a1']);
    await t.cache.namesFor('m2', ['b1']);
    await t.cache.namesFor('m1', ['a1']);
    expect(t.loads).toEqual(['m1', 'm2', 'm1']);
    expect(t.cache.size).toBe(1);
  });
});
