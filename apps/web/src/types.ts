/**
 * @file   apps/web/src/types.ts
 * @module web
 * @brief  Local type aliases matching the Quick Test server response (WP-08).
 *
 * Responsibility: declare the shapes the client renders. These mirror
 *                 apps/server/src/dev/quicktest.ts's QuickTestResult; the layer rules
 *                 forbid web from importing domain or server, so we keep a local copy
 *                 of the fields the UI needs. Both widen together as WP-08 evolves.
 * Depends on:     nothing
 * Used by:        ./App, ./components/*
 * Spec:           docs/spec/15-implementation-plan.md WP-08, docs/spec/02-software-architecture.md §3
 */

export type GameType = 'royale' | 'classicSeasons' | 'classic';

export type Cell =
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'free' }
  | { readonly kind: 'symbol'; readonly value: number };

export interface PlayerResult {
  readonly accountId: string;
  readonly card: {
    readonly cells: readonly Cell[];
    readonly seasonCells: readonly number[] | null;
  };
  readonly marks: readonly boolean[];
  readonly place: number;
  readonly prizesWon: readonly string[];
}

export interface Award {
  readonly prizeKey: string;
  readonly accountId: string;
  readonly drawIndex: number;
}

export interface QuickTestResult {
  readonly gameType: GameType;
  readonly draws: readonly number[];
  readonly players: readonly PlayerResult[];
  readonly awards: readonly Award[];
}

export const SEASON_SYMBOLS: Readonly<Record<number, string>> = Object.freeze({
  101: '🌱',
  102: '☀️',
  103: '🍂',
  104: '❄️',
});

export const SEASON_NAMES = ['spring', 'summer', 'autumn', 'winter'] as const;
