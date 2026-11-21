// @vitest-environment jsdom
/**
 * @file   apps/web/src/admin/adminPresets.test.tsx
 * @module web/admin
 * @brief  The admin area's Presets page and a preset change in the History (piece 3).
 *
 * Responsibility: `#/admin/presets` is the Presets page; it shows a preset's values in tabs
 *                 with the unit, the built-in default and the technical limit the server sent,
 *                 milliseconds as seconds; Save posts only the changed value in stored units;
 *                 the chosen tab stays after a save; "Retire" posts the status; the server's refusal reads as a sentence. The
 *                 History names a preset change by its value: "… · Time between numbers: 3 s →
 *                 9 s", a stage's value with its stage.
 * Depends on:     @testing-library/react, ../shell/router, ../shell/session, ./AdminPresets,
 *                 ./changeText
 * Spec:           docs/concepts/admin-area.md §4 (Presets, History), §9 piece 3
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { hrefOf, parseRoute } from '../shell/router.js';
import { SessionProvider } from '../shell/session.js';
import { AdminPresets } from './AdminPresets.js';
import { changeLines } from './changeText.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const INTERVAL = {
  path: 'draws.intervalMsRealtime',
  tab: 'draws',
  label: 'Time between numbers',
  description: 'How many seconds pass between two numbers when the draws are timed.',
  kind: 'number',
  unit: 's',
  scale: 1000,
  min: 2000,
  max: 60000,
  value: 3000,
  default: 3000,
};
const ROUNDS = {
  ...INTERVAL,
  path: 'stages.1.rounds',
  tab: 'stages',
  label: 'Rounds',
  unit: 'rounds',
  scale: 1,
  min: 1,
  max: 10,
  value: 2,
  default: 2,
};
const PRESET = {
  id: 'royale-realtime',
  name: 'Battle royale',
  gameType: 'royale',
  mode: 'realtime',
  status: 'published',
  fields: [INTERVAL, ROUNDS],
};

function serve(): string[] {
  const sent: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      sent.push(
        `${init?.method ?? 'GET'} ${url} ${typeof init?.body === 'string' ? init.body : ''}`,
      );
      if (url.endsWith('/status'))
        return Promise.resolve(
          new Response(JSON.stringify({ code: 'LAST_PUBLISHED' }), { status: 409 }),
        );
      const body = url.endsWith('/session')
        ? {
            signedIn: true,
            account: null,
            permissions: ['admin.view', 'settings.edit'],
            csrfToken: 'x',
          }
        : url.endsWith('/admin/presets')
          ? { presets: [PRESET] }
          : { preset: { ...PRESET, fields: [{ ...INTERVAL, value: 9000 }, ROUNDS] } };
      return Promise.resolve(new Response(JSON.stringify(body)));
    }),
  );
  return sent;
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe('the Presets page (admin-area §4)', () => {
  it('lives at #/admin/presets', () => {
    expect(parseRoute('#/admin/presets')).toEqual({ name: 'admin', section: 'presets' });
    expect(hrefOf({ name: 'admin', section: 'presets' })).toBe('#/admin/presets');
  });

  it('shows a value in seconds with its default and limit, and saves only the change', async () => {
    const sent = serve();
    render(
      <SessionProvider>
        <AdminPresets />
      </SessionProvider>,
    );
    await settle();
    const row = screen.getByTestId('preset-draws-intervalMsRealtime');
    expect(row.textContent).toContain('Built in: 3 s · technical limit 2 s – 60 s');
    const input = screen.getByLabelText<HTMLInputElement>('Time between numbers');
    expect(input.value).toBe('3');
    fireEvent.change(input, { target: { value: '9' } });
    fireEvent.click(screen.getByTestId('preset-save'));
    await settle();
    expect(sent).toContain(
      'POST /api/v1/admin/presets/royale-realtime {"values":{"draws.intervalMsRealtime":9000},"comment":""}',
    );
    expect(screen.getByLabelText<HTMLInputElement>('Time between numbers').value).toBe('9');
    fireEvent.click(screen.getByRole('button', { name: 'Stages and cuts' }));
    expect(screen.getByTestId('preset-stages-1-rounds').textContent).toContain('Stage 2 · Rounds');
  });
});

describe('the Presets page after a save', () => {
  it('stays on the tab after a save', async () => {
    serve();
    render(
      <SessionProvider>
        <AdminPresets />
      </SessionProvider>,
    );
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Stages and cuts' }));
    fireEvent.change(screen.getByLabelText('Stage 2 · Rounds'), { target: { value: '3' } });
    fireEvent.click(screen.getByTestId('preset-save'));
    await settle();
    expect(
      screen.getByRole('button', { name: 'Stages and cuts' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('says why retiring the last published preset is refused', async () => {
    serve();
    render(
      <SessionProvider>
        <AdminPresets />
      </SessionProvider>,
    );
    await settle();
    fireEvent.click(screen.getByTestId('preset-status'));
    await settle();
    expect(screen.getByRole('status').textContent).toBe(
      'Publish another preset of this kind first — one must stay published.',
    );
  });
});

describe('a preset change in the History (admin-area §6)', () => {
  it('reads as the value that changed, in its unit', () => {
    const before = {
      name: 'Battle royale',
      status: 'published',
      ruleset: { draws: { intervalMsRealtime: 3000 }, stages: [{ rounds: 1 }, { rounds: 2 }] },
    };
    const after = {
      ...before,
      ruleset: { draws: { intervalMsRealtime: 9000 }, stages: [{ rounds: 1 }, { rounds: 3 }] },
    };
    const entry = {
      id: 1,
      at: 0,
      actor: 'dev-admin',
      action: 'settings.change',
      target: 'preset:royale-realtime@2',
      diff: { from: before, to: after },
      undoable: true,
    };
    expect(changeLines(entry, {})).toEqual([
      'Battle royale · Time between numbers: 3 s → 9 s',
      'Battle royale · Stage 2 · Rounds: 2 rounds → 3 rounds',
    ]);
    expect(changeLines({ ...entry, diff: { from: {}, to: before } }, {})).toEqual([
      'New preset: Battle royale',
    ]);
  });
});
