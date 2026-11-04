/**
 * @file   apps/server/src/view/liveViews.test.ts
 * @module server/view
 * @brief  The shared live replay: extended step by step it equals a full replay; no repeats.
 *
 * Responsibility: a royale match simulated by the domain is replayed by `LiveViews` in two
 *                 steps (half the log, then all of it) and gives the same renamed events,
 *                 status timelines, stage baselines and first-round cards as one full
 *                 replay; two fetches at the same time add every event once; the events the
 *                 caller holds are used instead of reading the log; a name that changed (a
 *                 deleted account, audit S10) is read again after 30 s, or at once after a
 *                 deletion here, and rebuilds the replay; unchanged names keep it.
 * Depends on:     @sbr/application, @sbr/domain, ./liveViews, ./clientEvents, ../match/codec
 * Spec:           docs/spec/06-realtime-architecture.md §8
 */
import {
  defaultRulesetFor,
  toMatchRuleset,
  type LoadedMatch,
  type StoredEvent,
} from '@sbr/application';
import { simulateMatch } from '@sbr/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { publicEvent } from '../match/codec.js';
import { LiveReplay } from './clientEvents.js';
import { LiveViews } from './liveViews.js';

const sim = simulateMatch({
  matchId: 'm1',
  seed: new Uint8Array(32).fill(3),
  gameType: 'royale',
  ruleset: toMatchRuleset(defaultRulesetFor('royale'), 'auto', {
    kind: 'autoMarkAfter',
    delayMs: 3_000,
  }),
  playerCount: 12,
  tickedPrizes: [],
});
const stored: StoredEvent[] = sim.events.map((event, i) => ({ seq: i + 1, event, occurredAt: i }));
const names = Object.fromEntries(sim.state.playerOrder.map((id) => [id, `name-${id}`]));

function match(seq: number): LoadedMatch {
  return { record: { id: 'm1' }, state: sim.state, seq } as unknown as LoadedMatch;
}

// Over the simulated log; `reads` counts the log reads, `book` holds the current names.
function views(book: Record<string, string> = names, reads = { log: 0 }): LiveViews {
  return new LiveViews({
    events: (_id, afterSeq) => {
      reads.log += 1;
      return Promise.resolve(stored.filter((e) => e.seq > afterSeq));
    },
    names: () => Promise.resolve({ ...book }),
    manualTaps: () => Promise.resolve([]),
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('shared live replay', () => {
  it('extended step by step equals one full replay', async () => {
    const live = views();
    await live.entryFor(match(Math.floor(stored.length / 2)));
    const entry = await live.entryFor(match(stored.length));
    const full = new LiveReplay(entry.idMap, 'all');
    full.extend(sim.events.map(publicEvent));
    expect(entry.replay.length).toBe(stored.length);
    expect(entry.replay.renamed).toEqual(full.renamed);
    expect(entry.replay.ownerStatus).toEqual(full.ownerStatus);
    expect(entry.replay.stagePoints).toEqual(full.stagePoints);
    expect([...entry.replay.firstCards]).toEqual([...full.firstCards]);
  });

  it('adds every event once when fetches come at the same time', async () => {
    const live = views();
    const [a, b] = await Promise.all([
      live.entryFor(match(stored.length)),
      live.entryFor(match(stored.length)),
    ]);
    expect(a.replay.renamed).toHaveLength(stored.length);
    expect(b.replay).toBe(a.replay);
  });

  it('extends with the events the caller holds, without reading the log', async () => {
    const reads = { log: 0 };
    const live = views(names, reads);
    await live.entryFor(match(10));
    await live.entryFor(match(stored.length), stored.slice(10));
    expect(reads.log).toBe(1);
  });

  it('names a deleted account as such after 30 s, or at once after a deletion here', async () => {
    vi.useFakeTimers();
    const book = { ...names };
    const live = views(book);
    const first = await live.entryFor(match(stored.length));
    const gone = sim.state.playerOrder[0] ?? '';
    book[gone] = 'deleted player 1a2b';
    expect(await live.entryFor(match(stored.length))).toBe(first);
    vi.advanceTimersByTime(30_000);
    const later = await live.entryFor(match(stored.length));
    expect(later.idMap.get(gone)).toBe('deleted player 1a2b');
    book[gone] = 'deleted player 3c4d';
    live.accountGone(gone);
    expect((await live.entryFor(match(stored.length))).idMap.get(gone)).toBe('deleted player 3c4d');
  });

  it('keeps the replay when the names read again are the same', async () => {
    vi.useFakeTimers();
    const live = views();
    const first = await live.entryFor(match(stored.length));
    vi.advanceTimersByTime(30_000);
    expect(await live.entryFor(match(stored.length))).toBe(first);
  });
});
