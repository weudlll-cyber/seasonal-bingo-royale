// @vitest-environment jsdom
/**
 * @file   apps/web/src/host/startMatch.test.tsx
 * @module web/host
 * @brief  "Start a match": three steps from a preset, speed in words, inside the preset.
 *
 * Responsibility: the page shows the game types, the presets of the chosen type (an
 *                 asynchronous preset under the royale only; one preset as a single line) and
 *                 this match's choices: the title with the server's length limit, only the
 *                 starts the preset allows (a set time with its automatic start off unless
 *                 ticked, D16), players inside the preset's range, speed in words with what it
 *                 means, and under "More choices" the 15 s round pause (D21) within the server's
 *                 range; "Open the lobby" sends the preset and the speed, never an interval or
 *                 prizes; an asynchronous preset sends its mode and the time zone, no quiet
 *                 hours. The summary line names the choices. A late second answer of the presets
 *                 (strict mode) keeps the Organizer's choices.
 * Depends on:     @testing-library/react, ../test/matchFixture, ./StartMatch, ./startForm
 * Spec:           docs/concepts/admin-area.md §3, §8 (g), (h), §9 piece 4; 01 §7.6 (D16, D21)
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SessionProvider } from '../shell/session.js';
import { serveWithLimits, show, START_PRESETS } from '../test/matchFixture.js';
import { startBody, initialValues } from './startForm.js';
import { StartMatch } from './StartMatch.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const input = (id: string) => screen.getByTestId<HTMLInputElement>(id);

// The posted match, as JSON.
function posted(fetch: ReturnType<typeof vi.fn>): Record<string, unknown> | null {
  const calls = fetch.mock.calls as [string, RequestInit | undefined][];
  const post = calls.find(([url, init]) => url.endsWith('/matches') && init?.method === 'POST');
  return post === undefined
    ? null
    : (JSON.parse(post[1]?.body as string) as Record<string, unknown>);
}

async function open(): Promise<ReturnType<typeof vi.fn>> {
  const fetch = serveWithLimits((url) =>
    url.endsWith('/presets')
      ? { presets: START_PRESETS }
      : url.endsWith('/matches')
        ? { code: 'NEW1', matches: [], mine: [] }
        : {},
  );
  await show(<StartMatch />);
  return fetch;
}

describe('Start a match (admin-area §3)', () => {
  it('offers the royale presets, the asynchronous one under the royale only', async () => {
    await open();
    expect(input('start-preset-royale-realtime').textContent).toContain('4 to 100 players');
    expect(screen.getByTestId('start-preset-royale-async').textContent).toContain('asynchronous');
    fireEvent.click(
      screen.getByTestId('start-type-classic').querySelector('input') as HTMLInputElement,
    );
    expect(screen.queryByTestId('start-preset-royale-async')).toBeNull();
    // One preset of the type: a single line, no choice to make.
    expect(screen.getByTestId('start-preset-classic-realtime').tagName).toBe('P');
    expect(screen.getByTestId('start-type-classicSeasons').textContent).toContain(
      'No preset published yet.',
    );
  });

  it('keeps this match inside the preset', async () => {
    await open();
    expect([input('start-players').min, input('start-players').max]).toEqual(['4', '100']);
    const starts = [...screen.getByTestId<HTMLSelectElement>('create-start-rule').options].map(
      (o) => o.value,
    );
    expect(starts).toEqual(['host', 'at']);
    expect(input('create-round-pause-sec').value).toBe('15');
    expect([input('create-round-pause-sec').min, input('create-round-pause-sec').max]).toEqual([
      '3',
      '120',
    ]);
  });
});

describe('Start a match in strict mode', () => {
  it('keeps the choices when a second answer of the presets arrives later', async () => {
    let late: (r: Response) => void = () => undefined;
    let asked = 0;
    serveWithLimits((url) => (url.endsWith('/matches') ? { matches: [], mine: [] } : {}));
    const base = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (!url.endsWith('/presets')) return base(url, init);
        asked += 1;
        const answer = new Response(JSON.stringify({ presets: START_PRESETS }));
        if (asked === 1) return Promise.resolve(answer);
        return new Promise<Response>((resolve) => {
          late = () => {
            resolve(answer);
          };
        });
      }),
    );
    render(
      <SessionProvider>
        <StartMatch />
      </SessionProvider>,
      { reactStrictMode: true },
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.change(input('start-title'), { target: { value: 'Mine' } });
    await act(async () => {
      late(new Response());
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(asked).toBe(2);
    expect(input('start-title').value).toBe('Mine');
  });
});

describe('Start a match: what it sends', () => {
  it('a set time starts automatically only when ticked (D16)', async () => {
    await open();
    expect(screen.queryByTestId('create-start-auto')).toBeNull();
    fireEvent.change(screen.getByTestId('create-start-rule'), { target: { value: 'at' } });
    expect(input('create-start-auto').checked).toBe(false);
  });

  it('sends the preset and the speed in words, never an interval or prizes', async () => {
    const fetch = await open();
    fireEvent.click(screen.getByTestId('start-speed-quick'));
    expect(screen.getByText('A new number every 4 seconds.')).toBeTruthy();
    fireEvent.change(input('start-players'), { target: { value: '60' } });
    expect(screen.getByTestId('start-summary').textContent).toBe(
      'Battle royale · up to 60 players · starts when you press Start · a new number every 4 seconds',
    );
    fireEvent.click(screen.getByTestId('create-submit'));
    await show(<></>);
    const body = posted(fetch);
    expect(body).toMatchObject({
      preset: 'royale-realtime',
      speed: 'quick',
      maxPlayers: 60,
      gameType: 'royale',
    });
    expect(body !== null && ('drawIntervalMs' in body || 'prizes' in body)).toBe(false);
  });

  it('sends an asynchronous preset with its mode and the time zone, no quiet hours', () => {
    const away = START_PRESETS[1];
    if (away === undefined) throw new Error('fixture');
    const body = startBody(initialValues(away, new Date()), away, Date.now());
    expect(body).toMatchObject({
      mode: 'async',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    expect('quietHours' in body).toBe(false);
  });
});
