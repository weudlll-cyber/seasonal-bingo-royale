/**
 * @file   apps/server/src/dev/quicktest.ts
 * @module server/dev
 * @brief  In-memory Quick Test match runner for the browser (WP-08).
 *
 * Responsibility: given a seed, game type, player count and the ticked prize keys,
 *                 generate cards for the bot players, simulate one round through the
 *                 domain and return the full result as a JSON-friendly payload the
 *                 player client renders. Available only in non-production builds.
 * Depends on:     @sbr/domain
 * Used by:        ../http/routes/quicktest.ts
 * Spec:           docs/spec/15-implementation-plan.md WP-08, docs/spec/01-game-design.md §3a, §13
 */
import { createHash } from 'node:crypto';

import {
  BUILTIN_PRIZE_CATALOGUE_ORDER,
  classicPlacement,
  generateCard,
  SEED_BYTES,
  simulateClassicRound,
  type Card,
  type ClassicPlayer,
  type GameType,
} from '@sbr/domain';

export interface QuickTestInput {
  readonly gameType: GameType;
  readonly playerCount: number;
  readonly tickedPrizes: readonly string[];
  readonly seedText: string;
}

export interface QuickTestResult {
  readonly gameType: GameType;
  readonly draws: readonly number[];
  readonly players: ReadonlyArray<{
    readonly accountId: string;
    readonly card: Card;
    readonly marks: readonly boolean[];
    readonly place: number;
    readonly prizesWon: readonly string[];
  }>;
  readonly awards: ReadonlyArray<{
    readonly prizeKey: string;
    readonly accountId: string;
    readonly drawIndex: number;
  }>;
}

export function runQuickTest(input: QuickTestInput): QuickTestResult {
  const seed = seedFromText(input.seedText);
  const matchId = `quicktest-${input.gameType}-${input.seedText}`;
  const players = buildPlayers(matchId, input, seed);
  const result = simulateClassicRound({
    seed,
    matchId,
    roundIndex: 0,
    gameType: input.gameType,
    players,
    tickedPrizes: input.tickedPrizes,
  });
  const places = classicPlacement(
    players,
    result.awards,
    result.marksByAccount,
    BUILTIN_PRIZE_CATALOGUE_ORDER,
  );
  const placeByAccount = new Map(places.map((p) => [p.accountId, p]));
  return {
    gameType: input.gameType,
    draws: result.draws,
    players: players.map((player) => {
      const marks = result.marksByAccount[player.accountId] ?? [];
      const placement = placeByAccount.get(player.accountId);
      return {
        accountId: player.accountId,
        card: player.card,
        marks,
        place: placement?.place ?? 0,
        prizesWon: placement?.prizesWon ?? [],
      };
    }),
    awards: result.awards,
  };
}

function buildPlayers(
  matchId: string,
  input: QuickTestInput,
  seed: Uint8Array,
): readonly ClassicPlayer[] {
  return Array.from({ length: input.playerCount }, (_v, i): ClassicPlayer => {
    const accountId = `bot-${String(i + 1).padStart(2, '0')}`;
    return {
      accountId,
      joinedAt: i,
      card: generateCard({
        seed,
        matchId,
        roundIndex: 0,
        accountId,
        cardIndex: 0,
        gameType: input.gameType,
        freeCenter: true,
      }),
    };
  });
}

// Hash the owner-supplied text (e.g. "spring-10") into a 32-byte seed. Keeps the
// Quick Test friendly: the owner types a short label, the DRBG gets a full-width seed.
function seedFromText(text: string): Uint8Array {
  const bytes = new Uint8Array(createHash('sha256').update(text).digest());
  return bytes.slice(0, SEED_BYTES);
}
