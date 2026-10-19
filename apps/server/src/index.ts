/**
 * @file   apps/server/src/index.ts
 * @module server
 * @brief  Public entry point of @sbr/server.
 *
 * Responsibility: adapters and composition root (HTTP, WebSocket, database).
 *                 Shell only until its work package fills it (docs/spec/15-implementation-plan.md).
 * Depends on:     nothing yet
 * Used by:        src/index.test.ts
 * Spec:           docs/spec/02-software-architecture.md §3
 */

// Package identity, so the shell is importable and the test runner has something to check.
export const PACKAGE_NAME = '@sbr/server';
