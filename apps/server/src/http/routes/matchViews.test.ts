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
 *                 Every view names the players still in, best first (`rankedIn`, 01 §8.4).
 *                 The watched cards (D24) go to spectators and players who are out, never to
 *                 a player still in: the top 4 still in, cards the screen does not hold yet,
 *                 a followed player, "1 to go"; and the cut facts (D23).
 * Depends on:     @sbr/application, @sbr/domain, ./matchViews, ../../view/liveViews,
 *                 ../../view/watchView
 * Spec:           docs/spec/06-realtime-architecture.md §8; docs/spec/05-api-design.md §2.3
 */
import {
  defaultRulesetFor,
  toMatchRuleset,
  type LoadedMatch,
  type StoredEvent,
} from '@sbr/application';
import { byTieBreak, candidateOf, simulateMatch } from '@sbr/domain';
import { describe, expect, it, vi } from 'vitest';

import { LiveViews } from '../../view/liveViews.js';
import { NO_WATCH_QUERY, type WatchQuery } from '../../view/watchView.js';
import { liveView, matchSummary } from './matchViews.js';

// Every test replays this 200-player royale (about 9,000 events since the qualification
// plays two full rounds, 01 §7.1): alone a test takes 1-3 s, under a full parallel run
// longer than the default 5 s.
vi.setConfig({ testTimeout: 30_000 });

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
const NO_CLOCK_FACTS = { startHeld: false, quietUntil: null };
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
  lobbyClosesAt: null,
};

// The view of `viewer` (a player, or the host who plays not) with the events after
// `since`, the match at `seq`.
async function viewSince(
  since: number,
  seq = stored.length,
  viewer: string | null = me,
  watch: WatchQuery = NO_WATCH_QUERY,
) {
  const match = { record, state: sim.state, seq } as unknown as LoadedMatch;
  const views = new LiveViews({
    events: (_id, after) => Promise.resolve(stored.filter((e) => e.seq > after)),
    names: () => Promise.resolve({}),
    manualTaps: () => Promise.resolve([]),
  });
  const entry = await views.entryFor(match);
  return liveView({ match, entry, me: viewer, since, recap: null, clock: NO_CLOCK_FACTS, watch })
    .view;
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
    expect(matchSummary(m as unknown as LoadedMatch, null, NO_CLOCK_FACTS).status).toBe('finished');
  });
});

describe('the watched cards (D24)', () => {
  const stillIn = sim.state.playerOrder.filter(
    (id) => sim.state.players[id]?.eliminatedAtRound === null,
  );
  const out = sim.state.playerOrder.find((id) => sim.state.players[id]?.eliminatedAtRound !== null);
  const best = stillIn.map((id) => candidateOf(sim.state, id)).sort(byTieBreak);
  const round = sim.state.currentRound?.roundIndex ?? -1;

  it('gives a spectator the 4 best players still in with their cards, no draw order', async () => {
    const view = await viewSince(0, stored.length, 'a-spectator');
    expect(view.watch?.top).toEqual(best.slice(0, 4).map((c) => c.accountId));
    expect(Object.keys(view.watch?.cards ?? {}).sort()).toEqual(
      [...(view.watch?.top ?? [])].sort(),
    );
    expect(JSON.stringify(view.watch)).not.toContain('drawSequence');
  });

  it('gives a player who is out the same', async () => {
    expect((await viewSince(0, stored.length, out ?? '')).watch?.top).toHaveLength(4);
  });

  it('names every player still in, best first, for any viewer (01 §8.4)', async () => {
    const order = best.map((c) => c.accountId);
    expect((await viewSince(0)).rankedIn).toEqual(order);
    expect((await viewSince(5, stored.length, 'a-spectator')).rankedIn).toEqual(order);
    // Two views of 200 players: under a full parallel run more than the default 5 s.
  }, 20_000);

  it('gives a player still in no other card', async () => {
    expect((await viewSince(0, stored.length, stillIn[0] ?? '')).watch).toBeUndefined();
  });

  it('sends no card the screen already holds for this round, and adds a followed player', async () => {
    const top = best.slice(0, 4).map((c) => c.accountId);
    const followed = best[6]?.accountId ?? '';
    const view = await viewSince(0, stored.length, 'a-spectator', {
      follow: followed,
      knownRound: round,
      known: top,
    });
    expect(Object.keys(view.watch?.cards ?? {})).toEqual([followed]);
    expect(Object.keys(view.watch?.oneToGo ?? {}).sort()).toEqual([...top, followed].sort());
  });

  it('says what each cut did: points at elimination and shield-save margins', async () => {
    const view = await viewSince(0);
    const cuts = stored.filter((e) => e.event.type === 'cutApplied');
    const facts = view.cuts ?? [];
    expect(facts).toHaveLength(cuts.length);
    const first = cuts[0]?.event;
    if (first?.type !== 'cutApplied') throw new Error('no cut');
    expect(Object.keys(facts[0]?.out ?? {}).sort()).toEqual([...first.eliminated].sort());
    for (const margin of facts.flatMap((c) => Object.values(c.saved))) {
      expect(margin).toBeGreaterThanOrEqual(1);
      expect(margin).toBeLessThanOrEqual(3);
    }
  });
});
