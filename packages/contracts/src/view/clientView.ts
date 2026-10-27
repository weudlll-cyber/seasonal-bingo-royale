/**
 * @file   packages/contracts/src/view/clientView.ts
 * @module contracts/view
 * @brief  The payload the player client folds: Quick Test result and live match view.
 *
 * Responsibility: the wire shapes of one view for the Quick Test and a live match (cards,
 *                 the client's event union with only the fields it reads, players, the
 *                 owner's effect status, stage plan, timing and scoring settings) and the
 *                 season vocabulary they use. The server builds them
 *                 (apps/server/src/view/clientView.ts), the client renders them.
 * Depends on:     ../config/gameType, ./roundRecap
 * Used by:        apps/web (through src/types.ts), apps/server/src/view/clientView.ts, ../index
 * Spec:           docs/spec/05-api-design.md §2.3; docs/spec/01-game-design.md §4–§7
 */
import type { GameType } from '../config/gameType.js';
import type { RoundRecap } from './roundRecap.js';

export type MarkingMode = 'auto' | 'manual';

// What happens to a drawn number the owner has not tapped (01 §6): marked for the owner
// without bonus after delayMs, or left open until tapped.
export type MissedNumbers =
  { readonly kind: 'autoMarkAfter'; readonly delayMs: number } | { readonly kind: 'noAutoMark' };

// Season order: spring, summer, autumn, winter (classicSeasons symbols 101–104, 04 §3.4).
export const SEASON_NAMES = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASON_NAMES)[number];
export type EffectKind = 'multiplier' | 'growth' | 'harvest' | 'shield' | 'revealNext';

export type Cell =
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'free' }
  | { readonly kind: 'symbol'; readonly value: number };

export interface Card {
  readonly cells: readonly Cell[];
  // Cell indices of the four season cells in spring, summer, autumn, winter order;
  // null for `classic`.
  readonly seasonCells: readonly number[] | null;
}

// Final per-player summary from the server (after the match).
export interface PlayerSummary {
  readonly accountId: string;
  readonly isOwner: boolean;
  // First-round card; null in a live match for every player but the viewer.
  readonly card: Card | null;
  readonly place: number;
  readonly points: number;
  readonly seasonsActivated: number;
  readonly shieldCharges: number;
}

// The owner's effect status, sent by the server whenever it changes.
export interface OwnerStatus {
  readonly step: number;
  readonly multiplier: { readonly factor: number; readonly remainingDraws: number } | null;
  readonly growth: { readonly pointsPerMark: number; readonly remainingDraws: number } | null;
  readonly shieldCharges: number;
  readonly seasons: readonly Season[];
}

// The match events as the client sees them (only the fields it reads).
export type DomainEventLike =
  | { readonly type: 'lobbyOpened'; readonly gameType: GameType }
  | { readonly type: 'playerJoined'; readonly accountId: string; readonly joinedAt: number }
  | { readonly type: 'matchStarted' }
  | { readonly type: 'stageStarted'; readonly stageIndex: number }
  | {
      readonly type: 'roundStarted';
      readonly roundIndex: number;
      readonly stageIndex: number;
      readonly roundInStage: number;
      readonly drawSequence: readonly number[];
      readonly cardsByPlayer: Readonly<Record<string, readonly Card[]>>;
    }
  | { readonly type: 'drawMade'; readonly drawIndex: number; readonly item: number }
  | { readonly type: 'speedWindowClosed'; readonly drawIndex: number }
  | {
      readonly type: 'cellMarked';
      readonly accountId: string;
      readonly cardIndex: number;
      readonly cellIndex: number;
      readonly markPoints: number;
    }
  | {
      readonly type: 'seasonActivated';
      readonly accountId: string;
      readonly season: Season;
      readonly instantPoints: number;
    }
  | {
      readonly type: 'patternScored';
      readonly accountId: string;
      readonly cardIndex: number;
      readonly prizeKey: string;
      readonly points: number;
      readonly firstInRound: boolean;
    }
  | { readonly type: 'seasonCompleteFired'; readonly accountId: string; readonly points: number }
  | {
      readonly type: 'jackpotClaimed';
      readonly accountId: string;
      readonly roundIndex: number;
      readonly value: number;
    }
  | {
      readonly type: 'classicPrizeAwarded';
      readonly accountId: string;
      readonly prizeKey: string;
      readonly drawIndex: number;
    }
  | { readonly type: 'roundEnded'; readonly roundIndex: number; readonly reason: string }
  | {
      readonly type: 'cutApplied';
      readonly stageIndex: number;
      readonly survivors: readonly string[];
      readonly eliminated: readonly string[];
      readonly shieldSaves: readonly string[];
    }
  | {
      readonly type: 'matchFinished';
      readonly placement: readonly { readonly accountId: string; readonly place: number }[];
    }
  // When the next royale round starts (pause between rounds, D14).
  | { readonly type: 'nextRoundScheduled'; readonly at: number }
  // `by` is absent in events logged before D17 (they were the host's).
  | { readonly type: 'matchAborted'; readonly reason: string; readonly by?: 'host' | 'system' };

export interface StagePlanEntry {
  readonly kind: 'qualification' | 'elimination' | 'final';
  readonly rounds: number;
}

// One view for the Quick Test and a live match.
export interface QuickTestResult {
  readonly gameType: GameType;
  readonly markingMode: MarkingMode;
  // The starter's rule; an autoMarkAfter delay is at least the speed window.
  readonly missedNumbers: MissedNumbers;
  // Delay the owner's cards were computed with for points, standings and cuts.
  readonly ownerAutoMarkDelayMs: number;
  readonly drawIntervalMs: number;
  // Range a starter or host may set for `auto` draws (01 §5, D8).
  readonly drawIntervalRangeMs: { readonly min: number; readonly max: number };
  readonly speedWindowMs: number;
  readonly pointsPerMark: number;
  readonly maxSpeedBonus: number;
  readonly tickedPrizes: readonly string[];
  readonly events: readonly DomainEventLike[];
  readonly players: readonly PlayerSummary[];
  readonly stagePlan: readonly StagePlanEntry[];
  readonly ownerAccountIds: readonly string[];
  readonly ownerStatus: Readonly<Record<string, readonly OwnerStatus[]>>;
  // Every player's points right after each stage start (score carry applied by the server).
  readonly stagePoints: readonly {
    readonly step: number;
    readonly points: Readonly<Record<string, number>>;
  }[];
  readonly effectSeasons: Readonly<Partial<Record<EffectKind, Season>>>;
  // Recaps of royale rounds followed by a pause (D20): in a live match the one of the
  // pause now running, in the Quick Test every such round. Absent when there is none.
  readonly recaps?: readonly RoundRecap[];
}
