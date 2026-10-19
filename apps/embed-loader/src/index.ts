/**
 * @file   apps/embed-loader/src/index.ts
 * @module embed-loader
 * @brief  Public entry point of @sbr/embed-loader.
 *
 * Responsibility: tiny embed.js for host sites, no dependencies.
 *                 Shell only until its work package fills it (docs/spec/15-implementation-plan.md).
 * Depends on:     nothing yet
 * Used by:        src/index.test.ts
 * Spec:           docs/spec/07-integration-architecture.md
 */

// Package identity, so the shell is importable and the test runner has something to check.
export const PACKAGE_NAME = '@sbr/embed-loader';
