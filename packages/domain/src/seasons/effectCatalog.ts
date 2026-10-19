/**
 * @file   packages/domain/src/seasons/effectCatalog.ts
 * @module domain/seasons
 * @brief  Shape of the six effect types the admin can bind to a season (01 §8.2).
 *
 * Responsibility: a plain discriminated union mirroring the one in @sbr/contracts.
 *                 Duplicating the shape here (per the layer rules: domain does not
 *                 import contracts) is safe because the catalogue is immutable: new
 *                 effect types require code anyway (01 §8.2).
 * Depends on:     nothing
 * Used by:        ./applyEffect, ../scoring/*
 * Spec:           docs/spec/01-game-design.md §8.2
 */

export type Effect =
  | { readonly type: 'none' }
  | { readonly type: 'addPoints'; readonly points: number }
  | { readonly type: 'multiplier'; readonly factor: number; readonly durationDraws: number }
  | { readonly type: 'growth'; readonly pointsPerMark: number; readonly durationDraws: number }
  | {
      readonly type: 'harvest';
      readonly scope: 'row' | 'column' | 'card';
      readonly pointsPerMarked: number;
    }
  | { readonly type: 'shield'; readonly rankMargin: number; readonly charges: number }
  | { readonly type: 'revealNext'; readonly count: number };

export type EffectType = Effect['type'];
