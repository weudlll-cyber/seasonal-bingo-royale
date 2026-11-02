/**
 * @file   packages/contracts/src/http/leaderboard.ts
 * @module contracts/http
 * @brief  Answers of the leaderboard, public profile and data-export routes (05 §2.2, §2.4).
 *
 * Responsibility: the shapes the server sends and the player client shows: the periods
 *                 (season and all-time boards), a page of board rows, the caller's row with
 *                 its neighbours, a player's public profile (no e-mail, no real name, no
 *                 account id) and the caller's own data export. Ranks, points and counts
 *                 are the server's; the client only shows them.
 * Depends on:     nothing
 * Used by:        ../index, apps/server/src/http/routes/leaderboards,
 *                 apps/server/src/http/routes/profiles, apps/server/src/leaderboard/boards,
 *                 apps/server/src/leaderboard/profiles, apps/server/src/leaderboard/accountExport,
 *                 apps/web/src/league/LeaderboardPage, apps/web/src/league/ProfilePage
 * Spec:           docs/spec/05-api-design.md §2.2, §2.4; docs/spec/01-game-design.md §10
 */

export interface LeaderboardPeriod {
  readonly id: string;
  readonly kind: 'season' | 'all_time';
  readonly name: string;
  // ISO 8601; endsAt is null for the all-time board.
  readonly startsAt: string;
  readonly endsAt: string | null;
  readonly status: 'active' | 'closed';
  // Matches award league points with at least this many distinct verified players (03 §11).
  readonly minPlayers: number;
}

export interface LeaderboardPeriods {
  // Active periods first (the current season, then all-time), then closed seasons, newest first.
  readonly items: readonly LeaderboardPeriod[];
}

export interface LeaderboardRow {
  // Shared by players equal on points, wins and Season Completes: 1, 2, 2, 4 (D28).
  readonly rank: number;
  readonly displayName: string;
  readonly points: number;
  readonly wins: number;
  readonly seasonCompletes: number;
  // The signed-in caller's own row.
  readonly isYou: boolean;
}

export interface LeaderboardPage {
  readonly period: LeaderboardPeriod;
  readonly items: readonly LeaderboardRow[];
  // Opaque; null on the last page (05 §1 pagination).
  readonly nextCursor: string | null;
}

export interface LeaderboardAround {
  readonly period: LeaderboardPeriod;
  // The caller's row and up to five rows above and below it; empty without league points.
  readonly items: readonly LeaderboardRow[];
}

export interface ProfileBadge {
  readonly id: string;
  readonly name: string;
  readonly count: number;
}

export interface ProfileMatch {
  readonly code: string;
  readonly title: string;
  readonly finishedAt: string | null;
  readonly place: number | null;
  readonly players: number;
  // Whether the match gave this player league points, and if not, why (01 §10, 03 §11).
  readonly league: LeagueOutcome;
}

// `counted`: points awarded; otherwise the first reason that applies: the match's leaderboard
// switch was off, bots played, the player's e-mail was not confirmed while others counted,
// or too few verified players took part.
export type LeagueOutcome = 'counted' | 'switchOff' | 'bots' | 'notVerified' | 'tooFewPlayers';

export interface PlayerProfile {
  readonly displayName: string;
  readonly matchesPlayed: number;
  readonly wins: number;
  readonly bestPlacement: number | null;
  readonly seasonCompletes: number;
  readonly badges: readonly ProfileBadge[];
  // The last 10 finished matches, newest first.
  readonly recentMatches: readonly ProfileMatch[];
}

// GET /me/export (03 §19): everything the server keeps about the caller's account.
export interface AccountExport {
  readonly exportedAt: string;
  readonly account: {
    readonly id: string;
    readonly email: string | null;
    readonly emailVerifiedAt: string | null;
    readonly displayName: string;
    readonly status: string;
    readonly createdAt: string;
    readonly lastLoginAt: string | null;
    readonly roles: readonly string[];
  };
  readonly matches: readonly {
    readonly code: string;
    readonly title: string;
    readonly status: string;
    readonly joinedAt: string;
    readonly finalPlace: number | null;
    readonly score: number;
  }[];
  readonly leagueEntries: readonly {
    readonly period: string;
    readonly points: number;
    readonly wins: number;
    readonly seasonCompletes: number;
    readonly matches: number;
  }[];
  readonly leagueAwards: readonly {
    readonly period: string;
    readonly matchCode: string;
    readonly points: number;
    readonly place: number;
  }[];
  readonly badges: readonly {
    readonly badge: string;
    readonly matchCode: string;
    readonly awardedAt: string;
  }[];
}
