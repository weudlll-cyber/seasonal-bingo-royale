// @vitest-environment jsdom
/**
 * @file   apps/web/src/components/StepBadges.test.tsx
 * @module web
 * @brief  Discord steps show next to a listed name, from the website's own origin (2026-11-04).
 *
 * Responsibility: a listed name of a player with steps shows the kit's badges, one per step whose
 *                 icon is the website's own file, named by the step; a player without steps shows
 *                 none.
 * Depends on:     @testing-library/react, ./StepBadges, ../types (types)
 * Spec:           docs/spec/07-integration-architecture.md §2.3
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { PlayerSummary } from '../types.js';
import { NameSteps, StepsByName } from './StepBadges.js';

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

const ICON = '/media/step-icons/0123456789abcdef0123456789abcdef.webp';

describe('Discord steps next to a name', () => {
  it('shows the steps of a player who has them, and none for another', () => {
    const steps = [
      { ladder: 'holder' as const, name: 'Golden', icon: ICON },
      { ladder: 'farmer' as const, name: 'Seed', icon: null },
    ];
    render(
      <StepsByName players={[player('Gina', steps), player('Otto')]}>
        <p>
          <NameSteps name="Gina" />
          <NameSteps name="Otto" />
        </p>
      </StepsByName>,
    );
    expect(screen.getAllByTestId('steps')).toHaveLength(1);
    const badges = screen.getAllByRole('img');
    expect(badges.map((i) => i.getAttribute('alt'))).toEqual(['Golden']);
    expect(badges.map((i) => i.getAttribute('src'))).toEqual([ICON]);
  });
});
