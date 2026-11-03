/**
 * @file   packages/application/src/leaderboard/leaguePoints.ts
 * @module application/leaderboard
 * @brief  League points of a finished match: who counts, and how many points each place earns.
 *
 * Responsibility: a finished match awards league points only with its leaderboard flag on
 *                 (01 §3a.3), without any bot entry, and with at least `minPlayersForPoints`
 *                 distinct human accounts — verified ones when `requireVerifiedPlayers` (03
 *                 §11). Then every counted, placed account earns the placement table's points,
 *                 the finalist bonus when it reached the final, and the finish bonus. Pure:
 *                 the server's projection reads the entries and writes the awards.
 * Depends on:     @sbr/contracts (types)
 * Used by:        ../index
 * Spec:           docs/spec/01-game-design.md §10; docs/spec/03-security-architecture.md §11
 */
import type { LeaderboardConfig } from '@sbr/contracts';

export interface LeagueEntryInput {
  // Null for bots and for players whose account was deleted.
  readonly accountId: string | null;
  readonly isBot: boolean;
  // The account's e-mail address is confirmed.
  readonly verified: boolean;
  readonly place: number | null;
  // A royale player never eliminated, i.e. one who played the final.
  readonly finalist: boolean;
  readonly seasonComplete: boolean;
}

interface LeagueMatchInput {
  readonly countsForLeaderboard: boolean;
  readonly entries: readonly LeagueEntryInput[];
}

interface LeagueAward {
  readonly accountId: string;
  readonly points: number;
  readonly place: number;
  readonly win: boolean;
  readonly seasonComplete: boolean;
}

// The placement table's points for a place, the finalist bonus and the finish bonus.
export function placementPoints(
  place: number,
  finalist: boolean,
  config: LeaderboardConfig,
): number {
  const band = config.placementPoints.find((b) => place >= b.from && place <= b.to);
  return (band?.points ?? 0) + (finalist ? config.finalistBonus : 0) + config.finishBonus;
}

const counted = (e: LeagueEntryInput, config: LeaderboardConfig): e is CountedEntry =>
  e.accountId !== null && !e.isBot && (e.verified || !config.requireVerifiedPlayers);

type CountedEntry = LeagueEntryInput & { readonly accountId: string };

export function countsForLeague(match: LeagueMatchInput, config: LeaderboardConfig): boolean {
  if (!match.countsForLeaderboard) return false;
  if (match.entries.some((e) => e.isBot)) return false;
  const accounts = new Set(match.entries.filter((e) => counted(e, config)).map((e) => e.accountId));
  return accounts.size >= config.minPlayersForPoints;
}

// One award per counted, placed account; none when the match does not count.
export function leagueAwards(
  match: LeagueMatchInput,
  config: LeaderboardConfig,
): readonly LeagueAward[] {
  if (!countsForLeague(match, config)) return [];
  const seen = new Set<string>();
  const awards: LeagueAward[] = [];
  for (const e of match.entries) {
    if (!counted(e, config) || e.place === null || seen.has(e.accountId)) continue;
    seen.add(e.accountId);
    awards.push({
      accountId: e.accountId,
      points: placementPoints(e.place, e.finalist, config),
      place: e.place,
      win: e.place === 1,
      seasonComplete: e.seasonComplete,
    });
  }
  return awards;
}
