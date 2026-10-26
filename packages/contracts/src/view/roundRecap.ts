/**
 * @file   packages/contracts/src/view/roundRecap.ts
 * @module contracts/view
 * @brief  The recap of a royale round shown in the pause before the next round (D20).
 *
 * Responsibility: the wire shape the server builds from the match's own events
 *                 (apps/server/src/view/roundRecap.ts) and the player client shows as the
 *                 interlude: the round's top three by points scored in it, the biggest
 *                 climber in the standings, the cut (players out, shield saves), Season
 *                 Complete in the round, the fastest tapper, and a few facts. For fun only:
 *                 nothing in it awards points or changes a ranking. An item with no content
 *                 is left out. Names are the names the screens show; nothing secret (no seed,
 *                 no undrawn number, no other player's card).
 * Depends on:     nothing
 * Used by:        ./clientView, ../index, apps/server/src/view/roundRecap, apps/web/src/game/interlude
 * Spec:           docs/spec/01-game-design.md §7 (D20); docs/spec/05-api-design.md §2.3a
 */

export interface RecapScorer {
  readonly name: string;
  // Points scored in this round (stage multiplier included).
  readonly points: number;
}

export interface RoundRecap {
  // Match-wide index of the round this recap is about (0-based).
  readonly roundIndex: number;
  // Up to three players who scored most in the round, most first.
  readonly top?: readonly RecapScorer[];
  // Most places gained in the standings during the round (places 1-based).
  readonly climber?: { readonly name: string; readonly from: number; readonly to: number };
  // The cut after this round: how many are out, up to 8 of their names, and who the Winter
  // shield saved.
  readonly cut?: {
    readonly outCount: number;
    readonly out: readonly string[];
    readonly saved: readonly string[];
  };
  // Players who completed all four seasons in this round.
  readonly seasonComplete?: readonly string[];
  // Lowest average time from a draw to the player's own tap, over at least 5 taps inside the
  // speed window.
  readonly fastest?: { readonly name: string; readonly averageMs: number; readonly taps: number };
  readonly facts: { readonly numbersDrawn: number; readonly playersLeft: number };
}
