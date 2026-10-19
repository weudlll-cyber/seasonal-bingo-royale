/**
 * @file   packages/domain/src/index.ts
 * @module domain
 * @brief  Public entry point of @sbr/domain.
 *
 * Responsibility: pure game rules: no I/O, no clock, no randomness except injected ports.
 *                 Shell only until its work package fills it (docs/spec/15-implementation-plan.md).
 * Depends on:     nothing yet
 * Used by:        src/index.test.ts
 * Spec:           docs/spec/02-software-architecture.md §3
 */

// Package identity, so the shell is importable and the test runner has something to check.
export const PACKAGE_NAME = '@sbr/domain';
