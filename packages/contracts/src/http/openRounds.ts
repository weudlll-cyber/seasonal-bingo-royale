/**
 * @file   packages/contracts/src/http/openRounds.ts
 * @module contracts/http
 * @brief  The public open-rounds answer shared with the website (docs/OPEN-ROUNDS.md, D50).
 *
 * Responsibility: version 1 of GET <base>api/public/open-rounds: at most 20 rounds whose sign-up
 *                 is open and that the host marked for the website, each with a stable id, title,
 *                 kind, start and sign-up close (ISO 8601 UTC or null), player counts and an
 *                 absolute https join URL on the endpoint's own origin; no personal data.
 *                 Unknown fields are allowed (the website ignores them).
 * Depends on:     zod
 * Used by:        ../index, apps/server/src/http/routes/openRounds
 * Spec:           docs/OPEN-ROUNDS.md; docs/spec/07-integration-architecture.md §7
 */
import { z } from 'zod';

const isoOrNull = z.iso.datetime().nullable();

export const openRound = z.object({
  id: z.string().min(1).max(64),
  title: z.string().max(80),
  kind: z.string().max(40),
  startsAt: isoOrNull,
  signupClosesAt: isoOrNull,
  players: z.number().int().min(0),
  maxPlayers: z.number().int().min(1).nullable(),
  joinUrl: z.url({ protocol: /^https$/ }),
});

export const openRoundsAnswer = z.object({
  version: z.literal(1),
  rounds: z.array(openRound).max(20),
});

export type OpenRound = z.infer<typeof openRound>;
export type OpenRoundsAnswer = z.infer<typeof openRoundsAnswer>;
