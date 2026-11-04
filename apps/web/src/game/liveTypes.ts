/**
 * @file   apps/web/src/game/liveTypes.ts
 * @module web/game
 * @brief  What a live match screen holds: the summary and the view at a seq (types only).
 *
 * Responsibility: the match summary the server sends (05 §2.3) and the held live state. Kept
 *                 apart from ./useLiveMatch (which re-exports them) without its browser code.
 * Depends on:     @sbr/contracts (LiveHeld), ../types
 * Used by:        ./useLiveMatch, ./liveView
 * Spec:           docs/spec/05-api-design.md §2.3; docs/spec/06-realtime-architecture.md §8
 */
import type { LiveHeld } from '@sbr/contracts';

import type { QuickTestResult } from '../types.js';

export interface MatchSummary {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly gameType: QuickTestResult['gameType'];
  // Realtime or asynchronous (01 §11).
  readonly mode: 'realtime' | 'async';
  readonly status: 'lobby' | 'running' | 'finished' | 'aborted';
  readonly players: number;
  readonly maxPlayers: number;
  // Every place is taken (the server counts): no one can join, watching stays open.
  readonly full: boolean;
  readonly prizes: readonly string[];
  readonly countsForLeaderboard: boolean;
  readonly settings: {
    readonly markingMode: 'auto' | 'manual';
    readonly missedNumbers: QuickTestResult['missedNumbers'];
    readonly drawMode: 'auto' | 'host';
    readonly drawIntervalMs: number;
    // The pause between royale rounds (D14).
    readonly roundPause: { readonly kind: 'wait'; readonly ms: number } | { readonly kind: 'host' };
    // How the match starts (01 §7.6); a set time is announced, `auto` starts it then (D16).
    readonly startRule:
      | { readonly kind: 'host' }
      | { readonly kind: 'at'; readonly at: number; readonly auto: boolean }
      | { readonly kind: 'whenFull' };
    // Asynchronous matches: no draws inside these hours of the match's time zone (01 §5).
    readonly quietHours: { readonly startHour: number; readonly endHour: number } | null;
    readonly timeZone: string;
  };
  // The end of the running countdown; when an async lobby starts or closes (D34). Else null.
  readonly startsAt: number | null;
  readonly lobbyClosesAt: number | null;
  // When the next round starts after a cut (the cut screen counts down); null if unknown.
  readonly nextRoundAt: number | null;
  // When Draw next unlocks (D13); null before a round's first draw or outside a round.
  readonly nextDrawAt: number | null;
  // The match waits for its host to start the next round (D14).
  readonly waitingForHost: boolean;
  // Players needed to start (the ruleset's lobby.minPlayers, 01 §7.6).
  readonly minPlayers: number;
  // The automatic start found too few players; the match waits for its host (D16).
  readonly tooFewAtStart: boolean;
  // Maintenance holds the automatic start (D22).
  readonly startHeld?: boolean;
  // When the quiet hours the match is in end (01 §5); null outside them.
  readonly quietUntil: number | null;
  // From the server: the signed-in account created this match and may run it. Null in
  // room-wide updates; then the value already known is kept.
  readonly youHost: boolean | null;
}

// What a screen holds (@sbr/contracts liveHeld).
export type LiveState = LiveHeld<MatchSummary>;
