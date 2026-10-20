/**
 * @file   apps/web/src/playbackTypes.ts
 * @module web
 * @brief  Shapes of the Quick Test playback view-model (WP-08).
 *
 * Responsibility: the view-model the components render: players with their current
 *                 cards and marks, the owner's cut outcome, prize winners, banners.
 *                 Kept apart from the fold in ./playback.ts, which re-exports them.
 * Depends on:     ./types
 * Used by:        ./playback, ./components/*
 * Spec:           docs/spec/01-game-design.md §3a, §7, §13; docs/spec/15-implementation-plan.md WP-08
 */
import type { Card, OwnerStatus } from './types.js';

export interface Banner {
  readonly key: string;
  readonly text: string;
}

export interface PlayerView {
  readonly accountId: string;
  readonly isOwner: boolean;
  readonly cards: readonly Card[];
  readonly marks: readonly (readonly boolean[])[];
  readonly points: number;
  readonly seasonsActivated: number;
  readonly eliminated: boolean;
}

export type CutOutcome = 'survived' | 'saved' | 'eliminated';

export interface CutView {
  // Counts cuts so far; a new value means a new cut screen.
  readonly number: number;
  readonly owners: readonly { readonly accountId: string; readonly outcome: CutOutcome }[];
}

export interface PrizeWin {
  readonly drawNumber: number;
  readonly accountIds: readonly string[];
}

export interface PlaybackView {
  readonly currentStage: number;
  readonly currentRound: number;
  readonly drawsSoFar: readonly number[];
  readonly totalDraws: number;
  readonly standings: readonly PlayerView[];
  readonly owners: readonly PlayerView[];
  readonly ownerStatus: Readonly<Record<string, OwnerStatus | null>>;
  readonly lastCut: CutView | null;
  // Classic types: winners per prize key, with the draw number that awarded it.
  readonly prizeWinners: Readonly<Record<string, PrizeWin>>;
  readonly banners: readonly Banner[];
  readonly finished: boolean;
}
