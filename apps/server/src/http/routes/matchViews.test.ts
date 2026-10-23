/**
 * @file   apps/server/src/http/routes/matchViews.test.ts
 * @module server/http
 * @brief  A delta of the live view leaves out the player list unless it changed (NIGHT-4 piece 5).
 *
 * Responsibility: in a simulated 200-player royale, the full view and a delta with the
 *                 first round's start carry every player; a delta of draws and taps, or of a
 *                 later round start, carries no player list and stays small; a round start
 *                 carries only the viewer's own cards (none for the host) and no draw order,
 *                 and the player list only the viewer's first-round card (NIGHT-5) (the list was 169 of 175 KiB per screen and draw).
 * Depends on:     vitest, @sbr/application, @sbr/domain, ./matchViews, ../../view/liveViews
 * Spec:           docs/spec/06-realtime-architecture.md §8; docs/spec/05-api-design.md §2.3
 */
import {
  defaultRulesetFor,
  toMatchRuleset,
  type LoadedMatch,
  type StoredEvent,
} from '@sbr/application';
import { simulateMatch } from '@sbr/domain';
import { describe, expect, it } from 'vitest';

import { LiveViews } from '../../view/liveViews.js';
import { liveView, matchSummary } from './matchViews.js';

const sim = simulateMatch({
  matchId: 'm',
  seed: new Uint8Array(32).fill(3),
  gameType: 'royale',
  ruleset: toMatchRuleset(defaultRulesetFor('royale'), 'auto', { kind: 'noAutoMark' }),
  playerCount: 200,
  tickedPrizes: [],
});
const stored: StoredEvent[] = sim.events.map((event, i) => ({ seq: i + 1, event, occurredAt: i }));
const me = sim.state.playerOrder[0] ?? '';
const record = {
  id: 'm',
  gameType: 'royale',
  ruleset: defaultRulesetFor('royale'),
  prizes: [],
  settings: {
    markingMode: 'manual',
    missedNumbers: { kind: 'noAutoMark' },
    drawIntervalMs: 4000,
    drawMode: 'auto',
    roundPause: { kind: 'wait', ms: 6000 },
    startRule: { kind: 'host' },
  },
  status: 'running',
  startsAt: null,
};

// The view of `viewer` (a player, or the host who plays not) with the events after
// `since`, the match at `seq`.
async function viewSince(since: number, seq = stored.length, viewer: string | null = me) {
  const match = { record, state: sim.state, seq } as unknown as LoadedMatch;
  const views = new LiveViews({
    events: (_id, after) => Promise.resolve(stored.filter((e) => e.seq > after)),
    names: () => Promise.resolve({}),
  });
  return liveView({ match, entry: await views.entryFor(match), me: viewer, since }).view;
}

// How many players the view lists; null when it leaves the list out.
async function listed(since: number, seq?: number): Promise<number | null> {
  const view = await viewSince(since, seq);
  return 'players' in view ? view.players.length : null;
}

// The seq of the n-th event of a type.
function seqOf(type: string, n = 1): number {
  return stored.filter((e) => e.event.type === type)[n - 1]?.seq ?? 0;
}

describe('the live view delta', () => {
  it('carries the player list in full and when the first round starts', async () => {
    expect(await listed(0)).toBe(200);
    const first = seqOf('roundStarted');
    expect(await listed(first - 1, first)).toBe(200);
  });

  it('leaves it out at a later round start, whose event carries the cards', async () => {
    const second = seqOf('roundStarted', 2);
    expect(await listed(second - 1, second)).toBeNull();
  });

  it('leaves the player list out of a delta of draws and taps', async () => {
    const draw = seqOf('drawMade', 10);
    const view = await viewSince(draw - 1, draw + 5);
    expect(view.events.length).toBeGreaterThan(0);
    expect('players' in view).toBe(false);
    expect(JSON.stringify(view).length).toBeLessThan(20_000);
  });
});

describe('cards in a live view (NIGHT-5)', () => {
  // The round start in a view: whose cards it carries and how many draws it announces.
  async function roundStart(viewer: string | null) {
    const second = seqOf('roundStarted', 2);
    const view = await viewSince(second - 1, second, viewer);
    const event = view.events.find((e) => e.type === 'roundStarted');
    if (event?.type !== 'roundStarted') throw new Error('no round start');
    return { owners: Object.keys(event.cardsByPlayer), draws: event.drawSequence.length, view };
  }

  it("gives a player only their own cards and not the round's draw order", async () => {
    // A player still in the match in round 2.
    const dealt = stored.find((e) => e.seq === seqOf('roundStarted', 2))?.event;
    const survivor = dealt?.type === 'roundStarted' ? Object.keys(dealt.cardsByPlayer)[0] : '';
    const { owners, draws, view } = await roundStart(survivor ?? '');
    expect(owners).toEqual([survivor]);
    expect(draws).toBe(0);
    expect(JSON.stringify(view).length).toBeLessThan(10_000);
  });

  it('gives the host and spectators no cards', async () => {
    expect((await roundStart(null)).owners).toEqual([]);
  });

  it("lists only the viewer's own first-round card", async () => {
    const view = await viewSince(0);
    if (!('players' in view)) throw new Error('no player list');
    const withCard = view.players.filter((p) => p.card !== null).map((p) => p.accountId);
    expect(withCard).toEqual([me]);
  });
});

describe('the summary of an ended match (NIGHT-5)', () => {
  it('says finished as soon as the event log has the finish, before the record follows', () => {
    // The simulated match has finished; its record still says running.
    const m = { record: { ...record, status: 'running' }, state: sim.state, seq: 1 };
    expect(matchSummary(m as unknown as LoadedMatch, null).status).toBe('finished');
  });
});
