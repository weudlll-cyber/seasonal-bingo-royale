// @vitest-environment jsdom
/**
 * @file   apps/web/src/game/verifyMatch.test.tsx
 * @module web/game
 * @brief  The "Verify this match" page shows what the server found; it never decides itself.
 *
 * Responsibility: a verified answer shows "Everything matches", the commitment, the seed and
 *                 one row per round; an answer that does not verify says "Does not match" and
 *                 marks the round that differs; before the end the page says the seed comes
 *                 after the match; an unknown code says so; the route is #/verify/<code>.
 * Depends on:     @testing-library/react, @sbr/contracts (types), ./VerifyMatch, ../shell/router
 * Spec:           docs/spec/01-game-design.md §9
 */
import type { MatchVerificationView } from '@sbr/contracts';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { hrefOf, parseRoute } from '../shell/router.js';
import { VerifyMatch } from './VerifyMatch.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ANSWER: MatchVerificationView = {
  code: 'MATCH1',
  title: 'Friday bingo',
  status: 'finished',
  gameType: 'classic',
  commitment: 'ab'.repeat(32),
  seed: 'cd'.repeat(32),
  commitmentMatches: true,
  ruleset: {},
  rounds: [
    {
      roundIndex: 0,
      drawOrderMatches: true,
      draws: [5, 17, 33],
      drawsMatch: true,
      cardsChecked: 4,
      cardsMatch: true,
    },
  ],
  verified: true,
};

async function open(status: number, body: unknown): Promise<void> {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status }))),
  );
  render(<VerifyMatch code="MATCH1" />);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('Verify this match (01 §9)', () => {
  it('shows a verified match: verdict, commitment, seed and its rounds', async () => {
    await open(200, ANSWER);
    expect(screen.getByTestId('verify-verdict').dataset['verified']).toBe('true');
    expect(screen.getByTestId('verify-verdict').textContent).toMatch(/^Everything matches/);
    expect(screen.getByTestId('verify-commitment').textContent).toBe(ANSWER.commitment);
    expect(screen.getByTestId('verify-seed').textContent).toBe(ANSWER.seed);
    expect(screen.getByTestId('verify-commitment-matches').textContent).toBe('Yes');
    expect(screen.getAllByTestId('verify-round').map((r) => r.textContent)).toEqual([
      '1matches3 · matches4 · matches',
    ]);
  });

  it('says so when the match does not follow from the seed', async () => {
    const round = { ...ANSWER.rounds[0], cardsMatch: false } as MatchVerificationView['rounds'][0];
    await open(200, { ...ANSWER, rounds: [round], verified: false });
    expect(screen.getByTestId('verify-verdict').dataset['verified']).toBe('false');
    expect(screen.getByTestId('verify-verdict').textContent).toMatch(/^Does not match/);
    expect(screen.getByTestId('verify-round').textContent).toContain('4 · differs');
  });

  it('tells a viewer before the end that the seed comes after the match', async () => {
    await open(409, { code: 'MATCH_NOT_OVER' });
    expect(screen.getByTestId('verify-not-over').textContent).toContain('once the match is over');
    expect(screen.queryByTestId('verify-seed')).toBeNull();
  });

  it('says when there is no such match', async () => {
    await open(404, { code: 'NOT_FOUND' });
    expect(screen.getByTestId('verify-failed').textContent).toBe(
      'There is no match with this code.',
    );
  });

  it('lives at #/verify/<code>', () => {
    expect(parseRoute('#/verify/MATCH1')).toEqual({ name: 'verify', code: 'MATCH1' });
    expect(hrefOf({ name: 'verify', code: 'MATCH1' })).toBe('#/verify/MATCH1');
  });
});
