/**
 * @file   packages/contracts/src/view/liveFrames.ts
 * @module contracts/view
 * @brief  The live frames of a match: one room frame per step, one own frame per socket (06 §4, §8).
 *
 * Responsibility: the shapes the gateway sends after each step of a match (a draw, a batch of
 *                 taps, a cut, a round start or end; events within 40 ms are one step) and the
 *                 client applies without fetching. `LiveStepFrame` goes once to the match room:
 *                 the new events (round starts without cards or draw order), the summary (no
 *                 `youHost`) and the players still in in the server's order (each left out when
 *                 equal to what the room last got), the recap of the pause (null outside one),
 *                 and the stage baselines, cut facts and player list (no cards) only in the
 *                 steps that change them. `LiveOwnFrame` follows on each
 *                 socket: who the viewer plays as, their new effect-timeline entries, their own
 *                 cards of the step's round starts and first-round card, and the watched cards
 *                 of a viewer who watches (D24). Nothing in either is secret: no seed, no undrawn
 *                 number, no other player's card to a player still in.
 * Depends on:     ./clientView, ./roundRecap
 * Used by:        apps/server (realtime/liveSteps, view/stepFrames), apps/web (game/liveFrames)
 * Spec:           docs/spec/06-realtime-architecture.md §4, §8; docs/spec/01-game-design.md §9, §13
 */
import type {
  Card,
  CutFacts,
  DomainEventLike,
  OwnerStatus,
  PlayerSummary,
  QuickTestResult,
  WatchView,
} from './clientView.js';
import type { RoundRecap } from './roundRecap.js';

export interface LiveStepFrame<Summary = unknown> {
  // The seq of the step's last event, and the one before its first: a screen holding `since`
  // applies the step, any other fetches the events it misses.
  readonly s: number;
  readonly since: number;
  readonly events: readonly {
    readonly s: number;
    readonly at: number;
    readonly event: DomainEventLike;
  }[];
  // The summary and the players still in: left out when equal to what the room last got; the
  // screen keeps what it holds (a screen that fetched holds the same, 06 §8).
  readonly match?: Summary;
  readonly view: {
    readonly rankedIn?: readonly string[];
    readonly recaps: readonly RoundRecap[] | null;
    readonly stagePoints?: QuickTestResult['stagePoints'];
    readonly cuts?: readonly CutFacts[];
    readonly players?: readonly PlayerSummary[];
  };
}

export interface LiveOwnFrame {
  readonly s: number;
  // The viewer's display name while they play in the match, else null.
  readonly me: string | null;
  // The viewer's effect timeline from entry `from` on (what they hold after `from` is replaced).
  readonly status?: { readonly from: number; readonly entries: readonly OwnerStatus[] };
  // The viewer's own cards of the step's round starts, by the event's seq.
  readonly cards?: Readonly<Record<string, readonly Card[]>>;
  // The viewer's first-round card, in a step that sends the player list.
  readonly card?: Card;
  // The watched cards (D24) of a player out or a spectator; null for a player still in.
  readonly watch: WatchView | null;
}
