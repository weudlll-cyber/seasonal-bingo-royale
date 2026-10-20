// @vitest-environment jsdom
/**
 * @file   apps/web/src/components/cardView.test.tsx
 * @module web
 * @brief  Card view of D7: B I N G O header, "G 52" labels, symbols as icons (RUN-4 step 5).
 *
 * Responsibility: the letters sit above the five columns of both card grids; the draw
 *                 ticker shows every number with its letter and symbols as icons; owner
 *                 cells carry the same label for screen readers and still mark with the
 *                 keyboard; prize banners name the deciding ball.
 * Depends on:     @testing-library/react, ./CardGrid, ./DrawTicker, ./OwnerCard,
 *                 ../playback, ../quickTestFixture
 * Spec:           docs/spec/01-game-design.md §4, §5, §13
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CardGrid } from './CardGrid.js';
import { DrawTicker } from './DrawTicker.js';
import { OwnerCard } from './OwnerCard.js';
import { playbackAt } from '../playback.js';
import { numberCard, royaleFixture } from '../quickTestFixture.js';
import type { DomainEventLike } from '../types.js';

afterEach(cleanup);

describe('card view (D7)', () => {
  it('shows B I N G O above the five columns, before the first cell', () => {
    const { container } = render(<CardGrid accountId="bot-02" card={numberCard(0)} marks={[]} />);
    const grid = container.querySelector('strong + div');
    const firstFive = [...(grid?.children ?? [])].slice(0, 5).map((el) => el.textContent);
    expect(firstFive).toEqual(['B', 'I', 'N', 'G', 'O']);
  });

  it('shows every drawn number with its letter and a symbol as its icon', () => {
    render(<DrawTicker draws={[1, 52, 75, 104]} speedWindowMs={3000} />);
    const items = [...screen.getByTestId('draw-ticker').children];
    expect(items.slice(0, 3).map((el) => el.textContent)).toEqual(['B 1', 'G 52', 'O 75']);
    expect(items[3]?.querySelector('img')?.getAttribute('alt')).toBe('winter');
  });

  it('names owner cells by letter and number, and Enter still marks a drawn cell', () => {
    const result = royaleFixture('manual');
    render(
      <OwnerCard
        accountId="owner-01"
        card={numberCard(0)}
        serverMarks={[]}
        result={result}
        drawsSoFar={[1]}
        roundOver={false}
      />,
    );
    const cell = screen.getByRole('button', { name: 'B 1' });
    expect(screen.getByRole('button', { name: 'free' })).toBeTruthy();
    fireEvent.keyDown(cell, { key: 'Enter' });
    expect(cell.getAttribute('data-marked')).toBe('true');
  });

  it('names the deciding ball in prize banners and the prize list', () => {
    const base = royaleFixture();
    const award: DomainEventLike = {
      type: 'classicPrizeAwarded',
      accountId: 'bot-02',
      prizeKey: 'rows-1',
      drawIndex: 1,
    };
    const events = [...base.events.slice(0, 6), award, ...base.events.slice(6)];
    const view = playbackAt({ ...base, events }, 7);
    expect(view.prizeWinners['rows-1']?.decided).toBe('draw 2 (B 2)');
    expect(view.banners.at(-1)?.text).toBe('rows-1 awarded to bot-02 on draw 2 (B 2)');
  });
});
