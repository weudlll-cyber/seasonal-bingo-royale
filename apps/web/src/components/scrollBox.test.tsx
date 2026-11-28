// @vitest-environment jsdom
/**
 * @file   apps/web/src/components/scrollBox.test.tsx
 * @module web
 * @brief  A scrolling box knows whether its content continues below (the "More below" sign).
 *
 * Responsibility: the review pictures of 2026-11-24 showed lists cut at the bottom edge of the game
 *                 area with no sign that they scroll. ScrollBox marks `data-more` true while
 *                 content lies below the visible part, false at the end and when nothing is cut
 *                 (jsdom has no layout: the box's metrics are set by hand).
 * Depends on:     @testing-library/react, ./ScrollBox
 * Spec:           docs/concepts/fit-audit.md §8
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ScrollBox } from './ScrollBox.js';

class FakeObserver {
  observe(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FakeObserver);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function boxWith(metrics: { scrollHeight: number; clientHeight: number }): HTMLElement {
  render(<ScrollBox data-testid="box">rows</ScrollBox>);
  const box = screen.getByTestId('box');
  for (const [k, v] of Object.entries(metrics)) {
    Object.defineProperty(box, k, { value: v, configurable: true });
  }
  return box;
}

describe('ScrollBox', () => {
  it('says there is more while content lies below the visible part', () => {
    const box = boxWith({ scrollHeight: 400, clientHeight: 300 });
    act(() => {
      fireEvent.scroll(box);
    });
    expect(box.dataset['more']).toBe('true');
  });

  it('says there is no more at the end of the content', () => {
    const box = boxWith({ scrollHeight: 400, clientHeight: 300 });
    box.scrollTop = 100;
    act(() => {
      fireEvent.scroll(box);
    });
    expect(box.dataset['more']).toBe('false');
  });

  // A result that arrives on an open page: no scroll, and no watched box changes its size.
  it('says there is more when content arrives without a scroll or a resize', async () => {
    const box = boxWith({ scrollHeight: 400, clientHeight: 300 });
    box.dataset['more'] = 'false';
    box.appendChild(document.createElement('section'));
    await waitFor(() => {
      expect(box.dataset['more']).toBe('true');
    });
  });

  it('says nothing is cut when the content fits', () => {
    const box = boxWith({ scrollHeight: 300, clientHeight: 300 });
    act(() => {
      fireEvent.scroll(box);
    });
    expect(box.dataset['more']).toBe('false');
  });
});
