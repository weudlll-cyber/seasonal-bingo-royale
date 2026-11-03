/**
 * @file   packages/contracts/src/http/myMatches.ts
 * @module contracts/http
 * @brief  GET /api/v1/me/matches: the signed-in player's matches that are not over (D39).
 *
 * Responsibility: the wire shape of the lobby's "My matches": every match the account joined
 *                 that is in its lobby, counting down or running, asynchronous and realtime,
 *                 with what the lobby needs to say where it stands (the start, the round,
 *                 cuts survived or the cut that put the player out). The server reads it in one
 *                 query; the client only puts it into words.
 * Used by:        ../index, apps/server (http/routes/myMatches), apps/web (game/MyMatches)
 * Spec:           docs/spec/05-api-design.md §2.2; docs/spec/01-game-design.md §11, §13 (D39)
 */

export interface MyMatch {
  readonly code: string;
  readonly title: string;
  readonly mode: 'realtime' | 'async';
  readonly status: 'lobby' | 'running';
  // The end of the running 10-second countdown; null before it runs.
  readonly startsAt: number | null;
  // An announced start time (01 §7.6, D16); null without one.
  readonly startAt: number | null;
  // "Start when full": the match starts when every place is taken.
  readonly startsWhenFull: boolean;
  // When an asynchronous lobby starts or closes (D33, D34); null for realtime.
  readonly lobbyClosesAt: number | null;
  // The newest round that started (0-based); null before the first.
  readonly roundIndex: number | null;
  // Cuts the player came through, and the cut (1-based) that put the player out (null while in).
  readonly cutsSurvived: number;
  readonly outInCut: number | null;
}

export interface MyMatches {
  readonly matches: readonly MyMatch[];
}
