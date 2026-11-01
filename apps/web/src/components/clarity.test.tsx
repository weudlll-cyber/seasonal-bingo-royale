// @vitest-environment jsdom
/**
 * @file   apps/web/src/components/clarity.test.tsx
 * @module web
 * @brief  Patterns this round, newest event lines, the final's fresh start, grouped standings,
 *         the watched cards (PLAYER-CLARITY, D23, D24).
 *
 * Responsibility: the royale patterns panel lists the stage's patterns with their points, the
 *                 viewer's tick and who was first (+50 %) or "still open"; the newest 3 event
 *                 lines sit apart from the full log, which expands; the final's notice says all
 *                 finalists start at 0 and how the final is won, can be closed and goes after the
 *                 first draws; the standings group "Still in", and in the final "In the final" and
 *                 "Out of the match" with the cut and the points at that moment; only players
 *                 still in can be followed; the watched cards show name, place, points and "1 to
 *                 go", a followed player alone with "Back to the top 4", and say when that player
 *                 went out.
 * Depends on:     @testing-library/react, ./PatternsPanel, ./RecentEvents, ./FinalNotice,
 *                 ./Standings, ../game/WatchCards, ../playback, ../test/quickTestFixture
 * Spec:           docs/spec/01-game-design.md §7.5, §8.1, §13 (D23, D24)
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FinalNotice } from './FinalNotice.js';
import { PatternsPanel } from './PatternsPanel.js';
import { RecentEvents } from './RecentEvents.js';
import { Standings } from './Standings.js';
import { WatchCards } from '../game/WatchCards.js';
import { playbackAt } from '../playback.js';
import { numberCard, royaleFixture } from '../test/quickTestFixture.js';
import type { QuickTestResult } from '../types.js';

afterEach(cleanup);

const result = royaleFixture();
const scored = (accountId: string, firstInRound: boolean) => ({
  type: 'patternScored' as const,
  accountId,
  cardIndex: 0,
  prizeKey: 'rows-1',
  points: 150,
  firstInRound,
});
const withEvents = (at: number, extra: QuickTestResult['events']): QuickTestResult => ({
  ...result,
  events: [...result.events.slice(0, at), ...extra, ...result.events.slice(at)],
});

describe('patterns this round', () => {
  it('lists the patterns with points, the viewer tick, who was first or still open', () => {
    const r = withEvents(8, [scored('bot-02', true), scored('owner-01', false)]);
    render(<PatternsPanel result={r} view={playbackAt(r, 10)} />);
    const row = screen.getByTestId('pattern-rows-1');
    expect(row.textContent).toContain('1 row');
    expect(row.textContent).toContain('100 pts');
    expect(row.textContent).toContain('✓');
    expect(row.textContent).toContain('first: bot-02 (+50 %)');
    expect(screen.getByTestId('pattern-fourCorners').textContent).toContain('still open');
  });
});

describe('newest event lines', () => {
  it('shows the newest 3 lines and keeps the whole log one click away', () => {
    const banners = ['a', 'b', 'c', 'd', 'e'].map((t) => ({ key: t, text: `line ${t}` }));
    render(<RecentEvents banners={banners} />);
    const recent = [...screen.getByTestId('recent-events').querySelectorAll('li')];
    expect(recent.map((li) => li.textContent)).toEqual(['line e', 'line d', 'line c']);
    expect(screen.getByTestId('match-log').querySelectorAll('li')).toHaveLength(5);
    expect(screen.getByText('Whole match log (5)')).toBeTruthy();
  });
});

describe("the final's fresh start (D23)", () => {
  it('says every finalist starts at 0 and how the final is won, until closed', () => {
    render(<FinalNotice result={result} view={playbackAt(result, 12)} />);
    expect(screen.getByTestId('final-notice').textContent).toContain(
      'Final: all 2 finalists start at 0 points — the first full card wins.',
    );
    fireEvent.click(screen.getByText('Got it'));
    expect(screen.queryByTestId('final-notice')).toBeNull();
  });

  it('is not shown before the final', () => {
    render(<FinalNotice result={result} view={playbackAt(result, 6)} />);
    expect(screen.queryByTestId('final-notice')).toBeNull();
  });
});

describe('grouped standings (D23)', () => {
  const labels = () =>
    [...screen.getByTestId('standings').children].map(
      (li) => li.getAttribute('data-testid') ?? li.textContent,
    );

  it('labels the players still playing before the final', () => {
    render(<Standings result={result} view={playbackAt(result, 11)} />);
    expect(labels()).toEqual([
      'Still in',
      'standing-bot-02',
      'standing-bot-03',
      'Out of the match',
      'standing-owner-01',
    ]);
  });

  it('separates the finalists from the players out, with their cut and points then', () => {
    render(<Standings result={result} view={playbackAt(result, 13)} />);
    expect(labels()).toEqual([
      'In the final',
      'standing-bot-02',
      'standing-bot-03',
      'Out of the match',
      'standing-owner-01',
    ]);
    expect(screen.getByTestId('standing-owner-01').textContent).toContain('out in cut 1 · 10 pts');
  });

  it('lets a watcher follow only players still in', () => {
    const follow = vi.fn();
    render(<Standings result={result} view={playbackAt(result, 13)} onFollow={follow} />);
    fireEvent.click(screen.getByRole('button', { name: /bot-03/ }));
    expect(follow).toHaveBeenCalledWith('bot-03');
    expect(screen.queryByRole('button', { name: /owner-01/ })).toBeNull();
  });
});

describe('the watched cards (D24)', () => {
  const watch = {
    top: ['bot-02', 'bot-03'],
    cards: {},
    oneToGo: { 'bot-02': ['fullCard'], 'bot-03': [] },
  };
  // In the final round both bots hold a card (round 2 deals them).
  const view = playbackAt(result, 15);

  it('shows the best players still in with place, points and "1 to go"', () => {
    render(<WatchCards watch={watch} view={view} followed={null} onBack={vi.fn()} />);
    const best = screen.getByTestId('watch-card-bot-02');
    expect(best.textContent).toContain('#1 bot-02');
    expect(best.textContent).toContain('1 to go: Full card');
    expect(screen.getByTestId('watch-card-bot-03')).toBeTruthy();
  });

  it('shows a followed player alone, with the way back', () => {
    const back = vi.fn();
    render(<WatchCards watch={watch} view={view} followed="bot-03" onBack={back} />);
    expect(screen.queryByTestId('watch-card-bot-02')).toBeNull();
    fireEvent.click(screen.getByText('Back to the top 4'));
    expect(back).toHaveBeenCalled();
  });

  it('says when the followed player went out and shows the top again', () => {
    const outView = playbackAt(result, 11);
    const cards = {
      ...outView,
      standings: outView.standings.map((p) => ({ ...p, cards: [numberCard(0)] })),
    };
    render(<WatchCards watch={watch} view={cards} followed="owner-01" onBack={vi.fn()} />);
    expect(screen.getByTestId('watch-followed-out').textContent).toBe(
      'owner-01 is out — back to the top 4',
    );
    expect(screen.getByTestId('watch-card-bot-02')).toBeTruthy();
  });
});
