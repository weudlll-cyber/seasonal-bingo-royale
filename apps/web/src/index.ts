/**
 * @file   apps/web/src/index.ts
 * @module web
 * @brief  Public entry point of @sbr/web.
 *
 * Responsibility: player client, also the embed target. Talks only through contracts.
 *                 Shell only until its work package fills it (docs/spec/15-implementation-plan.md).
 * Depends on:     nothing yet
 * Used by:        src/index.test.ts
 * Spec:           docs/spec/02-software-architecture.md §3
 */

// Package identity, so the shell is importable and the test runner has something to check.
export const PACKAGE_NAME = '@sbr/web';
