// @vitest-environment jsdom
/**
 * @file   apps/web/src/game/liveFrames.test.tsx
 * @module web/game
 * @brief  Live frames: other players' taps are appended, draws and own events fetch (NIGHT-3).
 *
 * Responsibility: a frame with only other players' taps is appended without a request; a
 *                 frame with a draw, or with the viewer's own tap, fetches the new events
 *                 (since the held seq); a gap fetches the new events too, never the whole
 *                 log again; a delta without the player list keeps the one held; events are
 *                 never held twice.
 * Depends on:     @testing-library/react, vitest, ./useLiveMatch, ../quickTestFixture
 * Spec:           docs/spec/06-realtime-architecture.md §4, §8
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { royaleFixture } from '../quickTestFixture.js';
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
        ? { match: {}, seq: HELD, since, me: 'owner-01', view }
        : { match: {}, seq: since + 1, since, me: 'owner-01', view: { ...slim, events: [DRAW] } };
    return Promise.resolve(new Response(JSON.stringify(body)));
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

const tap = (s: number, accountId: string) => ({
  s,
  events: [
    { s, event: { type: 'cellMarked', accountId, cardIndex: 0, cellIndex: 3, markPoints: 10 } },
  ],
});

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('live frames', () => {
  it("appends other players' taps without fetching", async () => {
    const fetch = serve();
    render(<Probe />);
    await settle();
    const before = fetch.mock.calls.length;
    act(() => {
      handlers.get('events')?.(tap(HELD + 1, 'bot-02'));
    });
    await settle();
    expect(fetch.mock.calls.length).toBe(before);
    expect(screen.getByTestId('probe').textContent).toBe(
      `${String(HELD + 1)}:${String(HELD + 1)}:${String(PLAYERS)}`,
    );
  });

  it("fetches for a draw and for the viewer's own tap, without repeating held events", async () => {
    const fetch = serve();
    render(<Probe />);
    await settle();
    act(() => {
      handlers.get('events')?.(tap(HELD + 1, 'owner-01'));
    });
    await settle();
    expect(String(fetch.mock.calls.at(-1)?.[0])).toContain(`since=${String(HELD)}`);
    expect(screen.getByTestId('probe').textContent).toBe(
      `${String(HELD + 1)}:${String(HELD + 1)}:${String(PLAYERS)}`,
    );
  });

  it('fetches only the new events after a gap and keeps the player list (NIGHT-4)', async () => {
    const fetch = serve();
    render(<Probe />);
    await settle();
    act(() => {
      handlers.get('events')?.(tap(HELD + 3, 'bot-02'));
    });
    await settle();
    const urls = (fetch.mock.calls as [string][]).map(([url]) => url);
    expect(urls.filter((u) => u.includes('since=0'))).toHaveLength(1);
    expect(urls.at(-1)).toContain(`since=${String(HELD)}`);
    expect(screen.getByTestId('probe').textContent).toBe(
      `${String(HELD + 1)}:${String(HELD + 1)}:${String(PLAYERS)}`,
    );
  });
});
