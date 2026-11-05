// @vitest-environment jsdom
/**
 * @file   apps/web/src/components/StepBadges.test.tsx
 * @module web
 * @brief  Discord steps show next to a ranked name, from the website's own origin (2026-11-04).
 *
 * Responsibility: a ranked row of a player with steps shows one badge per ladder with its
 *                 name for screen readers and the icon at its site-relative path; a player
 *                 without steps shows none.
 * Depends on:     @testing-library/react, ./RankRow, ./StepBadges, ../types (types)
 * Spec:           docs/spec/07-integration-architecture.md §2.3
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { PlayerSummary } from '../types.js';
import { RankRow } from './RankRow.js';
import { StepsByName } from './StepBadges.js';

afterEach(cleanup);

const player = (accountId: string, steps?: PlayerSummary['steps']): PlayerSummary => ({
  accountId,
  isOwner: false,
  card: null,
  place: 0,
  points: 0,
  seasonsActivated: 0,
  shieldCharges: 0,
  ...(steps === undefined ? {} : { steps }),
});

const row = (name: string) => (
  <RankRow rank={1} name={name} note="10 pts" seasons={null} own={false} out={false} attrs={{}} />
);

describe('Discord steps next to a name', () => {
  it('shows the steps of a player who has them, and none for another', () => {
    const steps = [
      { ladder: 'holder' as const, name: 'Golden', icon: '/media/step-icons/g.webp' },
      { ladder: 'farmer' as const, name: 'Seed', icon: null },
    ];
    render(
      <StepsByName players={[player('Gina', steps), player('Otto')]}>
        <ul>
          {row('Gina')}
          {row('Otto')}
        </ul>
      </StepsByName>,
    );
    expect(screen.getAllByTestId('step-badges')).toHaveLength(1);
    expect(screen.getByText('Holder: Golden')).toBeTruthy();
    expect(screen.getByText('Farmer: Seed')).toBeTruthy();
    const icons = document.querySelectorAll('.step-badge img');
    expect([...icons].map((i) => i.getAttribute('src'))).toEqual(['/media/step-icons/g.webp']);
  });
});
