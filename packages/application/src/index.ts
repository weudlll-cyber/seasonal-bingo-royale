/**
 * @file   packages/application/src/index.ts
 * @module application
 * @brief  Public entry point of @sbr/application.
 *
 * Responsibility: use cases (commands and queries) and the ports they depend on.
 *                 Shell only until its work package fills it (docs/spec/15-implementation-plan.md).
 * Depends on:     nothing yet
 * Used by:        src/index.test.ts
 * Spec:           docs/spec/02-software-architecture.md §3
 */

// Package identity, so the shell is importable and the test runner has something to check.
export const PACKAGE_NAME = '@sbr/application';
