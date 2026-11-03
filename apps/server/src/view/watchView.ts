/**
 * @file   apps/server/src/view/watchView.ts
 * @module server/view
 * @brief  The live cards a player who is out, or a spectator, watches (D24).
 *
 * Responsibility: decide who watches (not a player of the match, or a player who is out;
 *                 never a player still in) and build what they get: the 4 best-ranked players
 *                 still in (01 §8.4), the card layouts (compact) of the current round for the watched
 *                 players (top 4 and a followed player) the screen does not hold yet, and per
 *                 watched player the patterns one number away that can still score this round
 *                 ("1 to go": the stage's active patterns in royale, the open prizes in
 *                 classic types). Marks are not sent here: they are the public cellMarked
 *                 events every screen already folds. No seed, draw order or undrawn number.
 *                 `rankedIn`: the players still in, best first, also for the standings.
 * Depends on:     @sbr/contracts (WatchView, Card), @sbr/domain
 * Used by:        ../http/routes/matchViews (also `rankedIn` for every live view)
 * Spec:           docs/spec/01-game-design.md §13 (D24); docs/spec/06-realtime-architecture.md §8;
 *                 docs/spec/03-security-concept.md §11
 */
import type { CompactCard, WatchView } from '@sbr/contracts';
import {
  byTieBreak,
  candidateOf,
  oneToGoKeys,
  type MatchState,
  type RoundState,
} from '@sbr/domain';

// The watched set: the best players still in (a phone shows the first 2).
const TOP_COUNT = 4;

// What the screen asks for: a followed player and the cards it already holds for a round.
export interface WatchQuery {
  readonly follow: string | null;
  readonly knownRound: number | null;
  readonly known: readonly string[];
}

export const NO_WATCH_QUERY: WatchQuery = { follow: null, knownRound: null, known: [] };

// A viewer watches unless they are a player still in the match.
export function watches(state: MatchState, viewer: string | null): boolean {
  const p = viewer === null ? undefined : state.players[viewer];
  return p === undefined || p.eliminatedAtRound !== null;
}

// The players still in, best first by the tie-break chain (01 §8.4); also sent with every
// live view for the standings' order of equal points (./matchViews).
export function rankedIn(state: MatchState): readonly string[] {
  return state.playerOrder
    .filter((id) => state.players[id]?.eliminatedAtRound === null)
    .map((id) => candidateOf(state, id))
    .sort(byTieBreak)
    .map((c) => c.accountId);
}

export function buildWatchView(
  state: MatchState,
  idMap: ReadonlyMap<string, string>,
  query: WatchQuery,
): WatchView | undefined {
  const round = state.currentRound;
  if (round === null) return undefined;
  const name = (id: string): string => idMap.get(id) ?? id;
  const stillIn = state.playerOrder.filter((id) => state.players[id]?.eliminatedAtRound === null);
  const top = rankedIn(state).slice(0, TOP_COUNT);
  // Only a player still in can be followed (D24).
  const followed = stillIn.find((id) => name(id) === query.follow);
  const watched = followed === undefined || top.includes(followed) ? top : [...top, followed];
  const held = new Set(query.knownRound === round.roundIndex ? query.known : []);
  const cards: Record<string, readonly CompactCard[]> = {};
  const oneToGo: Record<string, readonly string[]> = {};
  for (const id of watched) {
    const dealt = round.cards[id] ?? [];
    if (!held.has(name(id))) cards[name(id)] = dealt.map((c) => compact(c.card));
    oneToGo[name(id)] = openOneToGo(state, round, dealt);
  }
  return { top: top.map(name), cards, oneToGo };
}

// One number per cell: 0 for the free centre (CompactCard).
function compact(card: RoundState['cards'][string][number]['card']): CompactCard {
  return {
    cells: card.cells.map((cell) => (cell.kind === 'free' ? 0 : cell.value)),
    seasonCells: card.seasonCells,
  };
}

// The patterns one number away on any of the player's cards that still score this round.
function openOneToGo(
  state: MatchState,
  round: RoundState,
  dealt: RoundState['cards'][string],
): readonly string[] {
  const open = state.gameType === 'royale' ? round.stage.activePatterns : round.outstandingPrizes;
  const keys = new Set<string>();
  for (const c of dealt) {
    for (const key of oneToGoKeys(c.marks)) {
      if (open.includes(key) && !c.scoredPrizes.includes(key)) keys.add(key);
    }
  }
  return open.filter((key) => keys.has(key));
}
