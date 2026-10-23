/**
 * @file   packages/domain/src/classic/classicPlacement.ts
 * @module domain/classic
 * @brief  Final placement for a classic round (01 §3a.2).
 *
 * Responsibility: order players by most valuable prize won (catalogue order), then by
 *                 number of prizes, then by marks on the card, then by join timestamp.
 *                 Returns a total order 1..N.
 * Depends on:     nothing
 * Used by:        ../match/decideRanking (classic final placement), ../index
 * Spec:           docs/spec/01-game-design.md §3a.2
 */
// The two inputs the placement needs: who played (join time is the last tie-break) and
// which prizes they won.
export interface ClassicPlayer {
  readonly accountId: string;
  readonly joinedAt: number;
}

export interface PrizeAward {
  readonly prizeKey: string;
  readonly accountId: string;
  readonly drawIndex: number;
}

export interface ClassicPlacement {
  readonly accountId: string;
  readonly place: number;
  readonly prizesWon: readonly string[];
  readonly marks: number;
}

export function classicPlacement(
  players: readonly ClassicPlayer[],
  awards: readonly PrizeAward[],
  marksByAccount: Readonly<Record<string, readonly boolean[]>>,
  catalogueOrder: readonly string[],
): readonly ClassicPlacement[] {
  const prizeRank = new Map(catalogueOrder.map((key, i) => [key, i]));
  const prizesByAccount = groupBy(awards);
  const rows = players.map((player) => {
    const prizes = prizesByAccount.get(player.accountId) ?? [];
    const marks = (marksByAccount[player.accountId] ?? []).filter(Boolean).length;
    return { player, prizes, marks };
  });
  rows.sort((a, b) => {
    const topA = topPrizeIndex(a.prizes, prizeRank);
    const topB = topPrizeIndex(b.prizes, prizeRank);
    if (topA !== topB) return topB - topA; // higher index = more valuable
    if (a.prizes.length !== b.prizes.length) return b.prizes.length - a.prizes.length;
    if (a.marks !== b.marks) return b.marks - a.marks;
    return a.player.joinedAt - b.player.joinedAt;
  });
  return rows.map((row, i) => ({
    accountId: row.player.accountId,
    place: i + 1,
    prizesWon: row.prizes,
    marks: row.marks,
  }));
}

function groupBy(awards: readonly PrizeAward[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const award of awards) {
    const list = map.get(award.accountId) ?? [];
    list.push(award.prizeKey);
    map.set(award.accountId, list);
  }
  return map;
}

function topPrizeIndex(prizes: readonly string[], ranks: ReadonlyMap<string, number>): number {
  let top = -1;
  for (const prize of prizes) {
    const rank = ranks.get(prize);
    if (rank !== undefined && rank > top) top = rank;
  }
  return top;
}
