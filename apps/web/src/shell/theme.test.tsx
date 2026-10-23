// @vitest-environment jsdom
/**
 * @file   apps/web/src/shell/theme.test.tsx
 * @module web/shell
 * @brief  The theme logic: early script and React agree; the toggle stores; the system is followed live.
 *
 * Responsibility: public/theme-init.js (run before the first paint) and ./theme resolve the
 *                 same theme for a stored choice, no choice with a dark or light system, and
 *                 blocked storage; the toggle flips and stores the choice; a change of the
 *                 system setting is followed only while nothing is stored.
 * Depends on:     @testing-library/react, vitest, ./theme, ./ThemeToggle,
 *                 ../../public/theme-init.js (raw), ../../public/theme-init.js?raw
 * Spec:           docs/spec/01-game-design.md §13; Seasonal Entertainment docs/DESIGN.md "Theme logic"
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import EARLY from '../../public/theme-init.js?raw';
import { resolveTheme } from './theme.js';
import { ThemeToggle } from './ThemeToggle.js';

let systemDark = false;
let listeners: (() => void)[] = [];

function system(dark: boolean): void {
  systemDark = dark;
  vi.stubGlobal('matchMedia', () => ({
    matches: systemDark,
    addEventListener: (_t: string, l: () => void) => listeners.push(l),
    removeEventListener: () => undefined,
  }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
  listeners = [];
  document.documentElement.removeAttribute('data-theme');
});

// The theme the early script sets on <html>.
function early(): string | null {
  // Runs the real file as the browser does before the first paint.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  (new Function(EARLY) as () => void)();
  return document.documentElement.getAttribute('data-theme');
}

describe('theme resolution', () => {
  it.each([
    ['stored dark, light system', 'dark', false, 'dark'],
    ['stored light, dark system', 'light', true, 'light'],
    ['nothing stored, dark system', null, true, 'dark'],
    ['nothing stored, light system', null, false, 'light'],
    ['junk stored, dark system', 'blue', true, 'dark'],
  ])('%s: early script and module agree', (_name, stored, dark, expected) => {
    system(dark);
    if (stored !== null) window.localStorage.setItem('se.theme', stored);
    expect(early()).toBe(expected);
    expect(resolveTheme()).toBe(expected);
  });

  it('follows the system setting when storage is blocked', () => {
    system(true);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(early()).toBe('dark');
    expect(resolveTheme()).toBe('dark');
  });
});

describe('the toggle', () => {
  it('flips and stores the choice; the system is followed only while nothing is stored', () => {
    system(false);
    render(<ThemeToggle />);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    // Nothing stored: a system change to dark is followed live.
    act(() => {
      systemDark = true;
      for (const l of listeners) l();
    });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(window.localStorage.getItem('se.theme')).toBe('light');
    expect(screen.getByTestId('theme-toggle').getAttribute('aria-label')).toBe(
      'Switch to dark theme',
    );
    // Now a choice is stored: the system setting no longer changes the theme.
    act(() => {
      systemDark = true;
      for (const l of listeners) l();
    });
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
