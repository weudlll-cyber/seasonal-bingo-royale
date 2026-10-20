/**
 * @file   apps/web/src/index.ts
 * @module web
 * @brief  Package entry: re-exports the shapes the smoke test asserts on (WP-08).
 *
 * Responsibility: the player client is bundled by Vite (./main.tsx is its real entry),
 *                 but the workspace package still needs an entry point for the smoke
 *                 test and future consumers. Keep this surface tiny.
 * Depends on:     ./types
 * Used by:        ./types.test.ts
 * Spec:           docs/spec/02-software-architecture.md §3
 */

export const PACKAGE_NAME = '@sbr/web';

export type { Cell, GameType, PlayerSummary, QuickTestResult } from './types.js';
