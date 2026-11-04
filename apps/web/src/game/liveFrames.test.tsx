// @vitest-environment jsdom
/**
 * @file   apps/web/src/game/liveFrames.test.tsx
 * @module web/game
 * @brief  Live steps: the room frame and the screen's own frame applied without a request (06 §8).
 *
 * Responsibility: a step (a draw, the viewer's own tap) is applied when its own frame
 *                 follows, with no request; the viewer's own cards of a round start go into
 *                 it and the effect timeline is replaced after the entry the frame starts at;
 *                 a step that does not follow the held seq (a gap) fetches only the new events,
 *                 never the whole log again, and the player list is kept; events are never held
 *                 twice.
 * Depends on:     @testing-library/react, ./useLiveMatch, ./liveTypes, ../test/matchFixture,
 *                 ../test/quickTestFixture
 * Spec:           docs/spec/06-realtime-architecture.md §4, §8
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { matchSummary } from '../test/matchFixture.js';
import { numberCard, royaleFixture } from '../test/quickTestFixture.js';
import type { LiveState } from './liveTypes.js';
import { useLiveMatch } from './useLiveMatch.js';

type Handler = (frame: unknown) => void;
const handlers = new Map<string, Handler>();
vi.mock('./socket.js', () => ({
  gameSocket: () => ({
    on: (name: string, fn: Handler) => handlers.set(name, fn),
    off: () => undefined,
    connected: false,
  }),
  intent: () => Promise.resolve({ ok: true }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  handlers.clear();
});

const view = royaleFixture();
// A complete summary, as the server sends with every answer.
const SUMMARY = matchSummary();
const HELD = view.events.length;
const PLAYERS = view.players.length;
const DRAW = { type: 'drawMade', drawIndex: 9, item: 9 };

function Probe(): React.ReactElement {
  const { live } = useLiveMatch('LIVE1');
  return (
    <p data-testid="probe">
      {live === null
        ? '-'
        : `${String(live.seq)}:${String(live.view.events.length)}:${String(live.view.players.length)}`}
    </p>
  );
}

function serve(): ReturnType<typeof vi.fn> {
  const fetch = vi.fn((url: string) => {
    const since = Number(new URL(url, 'http://x').searchParams.get('since') ?? 0);
    // A delta leaves out the player list, as the server does for draws and taps.
    const { players: _players, ...slim } = view;
    const body =
      since === 0
        ? { match: SUMMARY, seq: HELD, since, me: 'owner-01', view }
        : {
            match: SUMMARY,
            seq: since + 1,
            since,
            me: 'owner-01',
            view: { ...slim, events: [DRAW] },
          };
    return Promise.resolve(new Response(JSON.stringify(body)));
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

// One step: the room frame and this screen's own frame (the server sends both, 06 §8).
const step = (s: number, event: object, own: object = {}) => ({
  room: {
    s,
    since: s - 1,
    events: [{ s, at: 0, event }],
    match: SUMMARY,
    view: { rankedIn: [], recaps: null },
  },
  own: { s, me: 'owner-01', watch: null, ...own },
});
const myTap = {
  type: 'cellMarked',
  accountId: 'owner-01',
  cardIndex: 0,
  cellIndex: 3,
  markPoints: 10,
};

function send(frames: ReturnType<typeof step>): void {
  act(() => {
    handlers.get('events')?.(frames.room);
    handlers.get('own')?.(frames.own);
  });
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('live steps', () => {
  it('applies a draw and the own tap without fetching, events never twice', async () => {
    const fetch = serve();
    render(<Probe />);
    await settle();
    const before = fetch.mock.calls.length;
    send(step(HELD + 1, DRAW));
    send(step(HELD + 2, myTap));
    send(step(HELD + 2, myTap));
    await settle();
    expect(fetch.mock.calls.length).toBe(before);
    expect(screen.getByTestId('probe').textContent).toBe(
      `${String(HELD + 2)}:${String(HELD + 2)}:${String(PLAYERS)}`,
    );
  });

  it('puts the own cards into a round start and replaces the timeline after `from`', async () => {
    serve();
    let held: LiveState | null = null;
    function Holder(): null {
      held = useLiveMatch('LIVE1').live;
      return null;
    }
    render(<Holder />);
    await settle();
    const start = {
      type: 'roundStarted',
      roundIndex: 1,
      stageIndex: 0,
      roundInStage: 1,
      drawSequence: [],
      cardsByPlayer: {},
    };
    const card = numberCard(40);
    const status = {
      step: HELD + 1,
      multiplier: null,
      growth: null,
      shieldCharges: 1,
      seasons: [],
    };
    send(
      step(HELD + 1, start, {
        cards: { [String(HELD + 1)]: [card] },
        status: { from: 1, entries: [status] },
      }),
    );
    await settle();
    const now = held as LiveState | null;
    const last = now?.view.events.at(-1);
    expect(last?.type === 'roundStarted' ? last.cardsByPlayer : null).toEqual({
      'owner-01': [card],
    });
    const timeline = now?.view.ownerStatus['owner-01'] ?? [];
    expect(timeline).toHaveLength(2);
    expect(timeline[1]).toEqual(status);
  });
});

describe('a gap in the live steps', () => {
  it('fetches only the new events after a gap and keeps the player list (NIGHT-4)', async () => {
    const fetch = serve();
    render(<Probe />);
    await settle();
    send(step(HELD + 3, DRAW));
    await settle();
    const urls = (fetch.mock.calls as [string][]).map(([url]) => url);
    expect(urls.filter((u) => u.includes('since=0'))).toHaveLength(1);
    expect(urls.at(-1)).toContain(`since=${String(HELD)}`);
    expect(screen.getByTestId('probe').textContent).toBe(
      `${String(HELD + 1)}:${String(HELD + 1)}:${String(PLAYERS)}`,
    );
  });
});
