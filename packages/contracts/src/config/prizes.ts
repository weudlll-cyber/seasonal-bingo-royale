/**
 * @file   packages/contracts/src/config/prizes.ts
 * @module contracts/config
 * @brief  Classic-type prize catalogue (01 §3a.1) and the default ticked set.
 *
 * Responsibility: the keys of every built-in prize, their point values, their
 *                 catalogue order (used by the classic placement tie-break of
 *                 01 §3a.2), and the default ticked set that pre-fills the
 *                 match-create form (11 §3.2). Custom library patterns extend
 *                 this catalogue through the pattern document, below `fullCard`.
 *                 A prize key is capped at 32 characters and a list at 20 keys.
 * Depends on:     zod
 * Used by:        ./ruleset.ts, ./defaults/classicRealtime, ./defaults/classicSeasonsRealtime,
 *                 ../index (apps/server match-create and Quick Test bodies)
 * Spec:           docs/spec/01-game-design.md §3a.1, §3a.2; docs/spec/05-api-design.md §2.3
 */
import { z } from 'zod';

// Built-in prize keys in strict catalogue order. The order is load-bearing: it is the
// first tie-break for classic placement (01 §3a.2).
export const BUILTIN_PRIZE_KEYS = [
  'rows-1',
  'columns-1',
  'rows-2',
  'columns-2',
  'rows-3',
  'columns-3',
  'rows-4',
  'columns-4',
  'rows-5',
  'columns-5',
  'fourCorners',
  'oneDiagonal',
  'bothDiagonals',
  'fullCard',
] as const;

type BuiltinPrizeKey = (typeof BUILTIN_PRIZE_KEYS)[number];

export const BuiltinPrizeKeySchema = z.enum(BUILTIN_PRIZE_KEYS);

// Point values from the table in 01 §3a.1. Catalogue values stay as data so later
// WPs (admin editor WP-21, scoring WP-06) can read them without re-encoding.
export const BUILTIN_PRIZE_POINTS: Readonly<Record<BuiltinPrizeKey, number>> = Object.freeze({
  'rows-1': 100,
  'columns-1': 100,
  'rows-2': 200,
  'columns-2': 200,
  'rows-3': 300,
  'columns-3': 300,
  'rows-4': 400,
  'columns-4': 400,
  'rows-5': 500,
  'columns-5': 500,
  fourCorners: 100,
  oneDiagonal: 150,
  bothDiagonals: 300,
  fullCard: 500,
});

// Default ticked set (01 §3a.1). Also pre-fills the admin match-create form (11 §3.2).
export const DEFAULT_PRIZE_SELECTION: readonly BuiltinPrizeKey[] = Object.freeze([
  'rows-1',
  'rows-2',
  'fourCorners',
  'oneDiagonal',
  'fullCard',
]);

// The text a client may send for prizes is capped (audit): a key is at most
// PRIZE_KEY_MAX_LENGTH characters (the longest built-in key has 13), a list at most
// MAX_PRIZES keys. The database holds the same caps (migration 0008).
export const PRIZE_KEY_MAX_LENGTH = 32;
export const MAX_PRIZES = 20;
export const PrizeKeySchema = z.string().min(1).max(PRIZE_KEY_MAX_LENGTH);

// At runtime a prize list may also contain custom pattern keys defined in the ruleset's
// patterns array. The schema accepts any capped non-empty string, but duplicates are
// rejected and at least one key is required so the match cannot start with no prizes.
export const PrizeListSchema = z
  .array(PrizeKeySchema)
  .max(MAX_PRIZES)
  .nonempty({ error: 'at least one prize must be ticked' })
  .refine((list) => new Set(list).size === list.length, {
    error: 'prize keys must be unique',
  });
