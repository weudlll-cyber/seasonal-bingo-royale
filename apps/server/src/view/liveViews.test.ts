/**
 * @file   apps/server/src/view/liveViews.test.ts
 * @module server/view
 * @brief  The shared live replay: extended step by step it equals a full replay; no repeats.
 *
 * Responsibility: a royale match simulated by the domain is replayed by `LiveViews` in two
 *                 steps (half the log, then all of it) and gives the same renamed events,
 *                 status timelines, stage baselines and first-round cards as one full
 *                 replay; two fetches at the same time add every event once.
 * Depends on:     vitest, @sbr/application, @sbr/domain, ./liveViews, ./clientEvents,
 *                 ../match/codec
 * Spec:           docs/spec/06-realtime-architecture.md §8
 */
import {
  defaultRulesetFor,
  toMatchRuleset,
  type LoadedMatch,
  type StoredEvent,
} from '@sbr/application';
import { simulateMatch } from '@sbr/domain';
import { describe, expect, it } from 'vitest';

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

function views(): LiveViews {
  return new LiveViews({
    events: (_id, afterSeq) => Promise.resolve(stored.filter((e) => e.seq > afterSeq)),
    names: () => Promise.resolve(names),
    manualTaps: () => Promise.resolve([]),
  });
}

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
});
