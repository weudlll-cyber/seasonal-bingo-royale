/**
 * @file   packages/contracts/src/view/awaySummary.ts
 * @module contracts/view
 * @brief  "While you were away": what happened in an asynchronous match since the player last looked (01 §11).
 *
 * Responsibility: the wire shape the server builds from the match's event log since the
 *                 player's `last_seen_event_seq` (packages/application awaySummary) and the
 *                 player screen shows on top with a dismiss: numbers drawn, own marks,
 *                 patterns and season activations, Season Complete, own rank before and now,
 *                 cuts survived or the cut that put the player out, and the end of the
 *                 match. Only the player's own facts; nothing secret.
 * Depends on:     ./clientView (types)
 * Used by:        ../index, packages/application, apps/server, apps/web
 * Spec:           docs/spec/01-game-design.md §11; docs/spec/06-realtime-architecture.md §6
 */
import type { Season } from './clientView.js';

export interface AwaySummary {
  // The event range the summary covers: after `fromSeq`, up to and including `toSeq`.
  readonly fromSeq: number;
  readonly toSeq: number;
  readonly draws: number;
  // Cells marked on the player's own cards (the free centre is never a mark event).
  readonly marks: number;
  readonly patterns: number;
  readonly seasons: readonly Season[];
  readonly seasonComplete: boolean;
  readonly pointsBefore: number;
  readonly pointsNow: number;
  // Place among the players still in (1-based); null when out or not yet in a round.
  readonly rankBefore: number | null;
  readonly rankNow: number | null;
  readonly playersIn: number;
  readonly cutsSurvived: number;
  readonly eliminated: boolean;
  // The match ended meanwhile: the player's final place (null when it was aborted).
  readonly finished: boolean;
  readonly finalPlace: number | null;
}
