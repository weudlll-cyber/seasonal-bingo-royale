/**
 * @file   apps/web/src/types.ts
 * @module web
 * @brief  Local type aliases matching the Quick Test server response (WP-08).
 *
 * Responsibility: declare the shapes the client renders. These mirror the server's
 *                 apps/server/src/dev/quicktest.ts and quicktestEvents.ts; the layer
 *                 rules forbid web from importing domain or server, so a local copy
 *                 lives here. Both widen together as WP-08 evolves.
 * Depends on:     nothing
 * Used by:        ./App, ./playback, ./manualMarking, ./components/*
 * Spec:           docs/spec/15-implementation-plan.md WP-08, docs/spec/02-software-architecture.md §3
 */

export type GameType = 'royale' | 'classicSeasons' | 'classic';
export type MarkingMode = 'auto' | 'manual';

// What happens to a drawn number the owner has not tapped (01 §6): marked for the owner
// without bonus after delayMs, or left open until tapped.
export type MissedNumbers =
  { readonly kind: 'autoMarkAfter'; readonly delayMs: number } | { readonly kind: 'noAutoMark' };
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
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
  readonly card: Card;
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

// Mirror of the DomainEvent union (only the fields the UI reads).
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
  | { readonly type: 'matchAborted'; readonly reason: string };

export interface StagePlanEntry {
  readonly kind: 'qualification' | 'elimination' | 'final';
  readonly rounds: number;
}

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
}

export const SEASON_NAMES = ['spring', 'summer', 'autumn', 'winter'] as const;

// classicSeasons draw items 101–104 are the season symbols (04 §3.4).
export function seasonOfSymbol(item: number): Season | null {
  return SEASON_NAMES[item - 101] ?? null;
}

// Column letters in card order; column ranges B 1–15, I 16–30, N 31–45, G 46–60, O 61–75.
export const BINGO_LETTERS = ['B', 'I', 'N', 'G', 'O'] as const;

// A drawn number with its column letter, e.g. "G 52" (01 §5, D7). Symbols have no
// letter: their label is the season's name ("Winter"), shown next to the icon.
export function ballLabel(item: number): string {
  const season = seasonOfSymbol(item);
  if (season !== null) return season.charAt(0).toUpperCase() + season.slice(1);
  const letter = BINGO_LETTERS[Math.floor((item - 1) / 15)] ?? '?';
  return `${letter} ${String(item)}`;
}

// Spring, Summer, Autumn, Winter — colours shared with the Seasonal Entertainment
// website (01 §13 and assets/brand/colors.md).
export const SEASON_COLORS: Readonly<Record<Season, string>> = Object.freeze({
  spring: '#afb84e',
  summer: '#e06e22',
  autumn: '#f9a825',
  winter: '#04aaf7',
});

// Text and icons on a season colour (assets/brand/colors.md, --color-on-season).
export const ON_SEASON_COLOR = '#12161c';
