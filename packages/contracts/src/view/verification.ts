/**
 * @file   packages/contracts/src/view/verification.ts
 * @module contracts/view
 * @brief  The answer of GET /api/v1/matches/:code/verify: the revealed seed and the server's recomputation.
 *
 * Responsibility: the shape the server sends once a match has ended or was cancelled and
 *                 the player client shows on "Verify this match" (01 §9): the commitment
 *                 published at match open and the revealed seed (hex), the ruleset the match
 *                 ran with, and per round whether the draw order, the draws made and the
 *                 cards dealt are what the seed gives. No account ids: cards are counted,
 *                 not listed.
 * Depends on:     nothing
 * Used by:        ../index, apps/server/src/http/routes/matchVerify, apps/web/src/game/VerifyMatch
 * Spec:           docs/spec/01-game-design.md §9; docs/spec/05-api-design.md §2.3a
 */

export interface RoundVerification {
  readonly roundIndex: number;
  readonly drawOrderMatches: boolean;
  // The numbers drawn in the round, in order.
  readonly draws: readonly number[];
  readonly drawsMatch: boolean;
  readonly cardsChecked: number;
  readonly cardsMatch: boolean;
}

export interface MatchVerificationView {
  readonly code: string;
  readonly title: string;
  readonly status: 'finished' | 'aborted';
  readonly gameType: string;
  // sha256(seed), published when the match opened; both in lowercase hex.
  readonly commitment: string;
  readonly seed: string;
  readonly commitmentMatches: boolean;
  readonly ruleset: unknown;
  readonly rounds: readonly RoundVerification[];
  readonly verified: boolean;
}
