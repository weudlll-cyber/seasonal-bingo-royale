/**
 * @file   apps/server/src/view/cutFacts.ts
 * @module server/view
 * @brief  What one royale cut did, for the screens: points at elimination, shield-save margins.
 *
 * Responsibility: from the match state just before a cutApplied event and the event itself:
 *                 each eliminated player's points at that moment (the standings show "out in
 *                 cut K · P pts", D23) and, for each player the Winter shield saved, how many
 *                 places below the cut line they were ("Your Winter shield saved you in cut 1
 *                 (you were 2 places below the line)"). The ranking is the cut's own chain
 *                 (01 §8.4); the line sits under the players kept without a shield.
 * Depends on:     @sbr/contracts (CutFacts), @sbr/domain
 * Used by:        ./clientEvents (LiveReplay)
 * Spec:           docs/spec/01-game-design.md §7.4, §8.2, §13
 */
import type { CutFacts } from '@sbr/contracts';
import { byTieBreak, candidateOf, type DomainEvent, type MatchState } from '@sbr/domain';

type CutApplied = Extract<DomainEvent, { type: 'cutApplied' }>;

export function cutFactsOf(
  state: MatchState,
  ev: CutApplied,
  rename: (id: string) => string,
): CutFacts {
  const ranked = state.playerOrder
    .filter((id) => state.players[id]?.eliminatedAtRound === null)
    .map((id) => candidateOf(state, id))
    .sort(byTieBreak)
    .map((c) => c.accountId);
  // The survivors include those the shield saved; the others were kept by the cut rule.
  const kept = ev.survivors.length - ev.shieldSaves.length;
  return {
    out: Object.fromEntries(
      ev.eliminated.map((id) => [rename(id), state.players[id]?.points ?? 0]),
    ),
    saved: Object.fromEntries(
      ev.shieldSaves.map((id) => [rename(id), ranked.indexOf(id) - kept + 1]),
    ),
  };
}
