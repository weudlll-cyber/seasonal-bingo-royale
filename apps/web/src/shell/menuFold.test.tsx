// @vitest-environment jsdom
/**
 * @file   apps/web/src/shell/menuFold.test.tsx
 * @module web/shell
 * @brief  The phone menu: one button opens the navigation and account items, keyboard first.
 *
 * Responsibility: the button says whether the menu is open (aria-expanded) and names the panel
 *                 it controls; opening moves the focus to the panel's first item, Escape closes
 *                 it and gives the focus back to the button, a click outside closes it, and a
 *                 new route or another sign-in closes it. Whether it shows at all is CSS (phones
 *                 only, ./shell.css), measured by the e2e hostNav spec.
 * Depends on:     vitest, @testing-library/react, ./MenuFold
 * Spec:           docs/concepts/fit-audit.md §5 item 7 (O1, O2); owner decision of 2026-11-20
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MenuFold } from './MenuFold.js';

afterEach(cleanup);

function show(where = 'lobby', who: string | null = 'carla') {
  return render(
    <MenuFold where={where} who={who}>
      <nav aria-label="Main">
        <a href="#/">Play</a>
      </nav>
      <button type="button">Sign out</button>
    </MenuFold>,
  );
}

describe('the phone menu', () => {
  it('opens with the focus inside and closes with Escape, the focus back on the button', () => {
    show();
    const button = screen.getByTestId('menu-button');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    const panel = document.getElementById(button.getAttribute('aria-controls') ?? '');
    expect(panel?.contains(screen.getByText('Sign out'))).toBe(true);
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(panel?.dataset['open']).toBe('true');
    expect(document.activeElement).toBe(screen.getByText('Play'));
    fireEvent.keyDown(screen.getByText('Play'), { key: 'Escape' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
  });

  it('closes on a click outside, a new route and another sign-in', () => {
    const view = show();
    const button = screen.getByTestId('menu-button');
    fireEvent.click(button);
    act(() => {
      fireEvent.pointerDown(document.body);
    });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(button);
    view.rerender(
      <MenuFold where="leaderboard" who="carla">
        <a href="#/">Play</a>
      </MenuFold>,
    );
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(button);
    view.rerender(
      <MenuFold where="leaderboard" who="bob">
        <a href="#/">Play</a>
      </MenuFold>,
    );
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });
});
