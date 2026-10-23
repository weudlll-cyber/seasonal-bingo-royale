/**
 * @file   apps/server/src/dev/fastRulesets.ts
 * @module server/dev
 * @brief  The development-only fast test profile: a short royale for the acceptance play-through.
 *
 * Responsibility: a copy of the published royale default with one round per stage, 12
 *                 draws in the qualification and elimination rounds, and a final that ends
 *                 at the first completed row instead of the first full house — so a match
 *                 with 8 players plays in about three minutes. The classic types keep their
 *                 published defaults (their rounds end when every prize is won). Built as a
 *                 new object; the published defaults are never changed. Development only:
 *                 the create route accepts `testProfile: 'fast'` only when `dev` is on.
 * Depends on:     @sbr/contracts
 * Used by:        ../http/routes/matchInput.ts
 * Spec:           docs/spec/12-testing-strategy.md §4, §8; docs/spec/01-game-design.md §7
 */
import { RulesetSchema, royaleRealtimeDefault, type Ruleset } from '@sbr/contracts';

const FAST_DRAWS = 12;

function fastRoyale(): Ruleset {
  const [qualification, elimination] = royaleRealtimeDefault.stages ?? [];
  if (qualification === undefined || elimination === undefined) {
    throw new Error('royale default without its stages');
  }
  return RulesetSchema.parse({
    ...royaleRealtimeDefault,
    stages: [
      { ...qualification, rounds: 1, roundEnd: { kind: 'drawCount', draws: FAST_DRAWS } },
      { ...elimination, rounds: 1, roundEnd: { kind: 'drawCount', draws: FAST_DRAWS } },
      {
        kind: 'final',
        rounds: 1,
        roundEnd: { kind: 'firstBingo', graceDraws: 0 },
        scoreCarry: { kind: 'reset' },
        stageMultiplier: 1,
        activePatterns: ['rows-1'],
      },
    ],
  });
}

// The fast test ruleset of a game type, or null when the published default applies.
export function fastRuleset(
  gameType: Ruleset['gameType'],
): { readonly name: string; readonly ruleset: Ruleset } | null {
  return gameType === 'royale'
    ? { name: 'royale-realtime-fast-test', ruleset: fastRoyale() }
    : null;
}
