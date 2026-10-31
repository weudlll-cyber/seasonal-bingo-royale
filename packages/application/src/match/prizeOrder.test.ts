/**
 * @file   packages/application/src/match/prizeOrder.test.ts
 * @module application/match
 * @brief  The domain's prize catalogue order is the contract's prize list.
 *
 * Responsibility: the domain may import nothing from the repository (02 §3), so it keeps
 *                 its own copy of the built-in prize order; this layer sees both and
 *                 fails when the copy and @sbr/contracts (the one source for web, e2e
 *                 and the rulesets) drift apart.
 * Depends on:     @sbr/contracts, @sbr/domain
 * Spec:           docs/spec/01-game-design.md §3a.1; docs/spec/02-software-architecture.md §3
 */
import { BUILTIN_PRIZE_KEYS } from '@sbr/contracts';
import { BUILTIN_PRIZE_CATALOGUE_ORDER } from '@sbr/domain';
import { describe, expect, it } from 'vitest';

describe('prize catalogue order', () => {
  it('is the same in the domain and in the contracts', () => {
    expect(BUILTIN_PRIZE_CATALOGUE_ORDER).toEqual(BUILTIN_PRIZE_KEYS);
  });
});
