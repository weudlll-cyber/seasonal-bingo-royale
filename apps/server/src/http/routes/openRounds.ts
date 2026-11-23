/**
 * @file   apps/server/src/http/routes/openRounds.ts
 * @module server/http
 * @brief  GET <base>api/public/open-rounds: the open sign-ups the hosts marked for the website (D50).
 *
 * Responsibility: public, no login, rate-limited per address: version 1 of the contract shared
 *                 with the website (@sbr/contracts openRoundsAnswer, docs/OPEN-ROUNDS.md). The
 *                 query is Bingo's: the matches whose sign-up is open now (in the lobby, not
 *                 started, the asynchronous lobby window not closed) with "Show on the Seasonal
 *                 Entertainment website" on, never a test match (the fast test profile) or one
 *                 with bots, as many as "Screens and texts" allows; id, title, kind, start,
 *                 sign-up close, player counts and the join URL (the lobby page on the endpoint's
 *                 own origin). No personal data. The page is the kit's `openRoundsPage`
 *                 (@seasonal/kit/server, since v0.11.0): the website's checks applied here, a
 *                 title cut to 80 never through an emoji, at most 20 rounds whatever the setting,
 *                 a round it leaves out logged with its id; its Cache-Control (max-age=30). In
 *                 standalone installs the option does not exist: the list is empty.
 * Depends on:     fastify, @seasonal/kit/server (openRoundsPage), ../../db/pool
 * Used by:        ../app
 * Spec:           docs/OPEN-ROUNDS.md; docs/spec/07-integration-architecture.md §7
 */
import type { ScreenSettings } from '@sbr/contracts';
import {
  OPEN_ROUNDS_CACHE_CONTROL,
  openRoundsPage,
  type OpenRoundInput,
  type OpenRoundsPage,
} from '@seasonal/kit/server';
import type { FastifyInstance } from 'fastify';

import type { DbPool } from '../../db/pool.js';

interface OpenRoundsDeps {
  readonly pool: DbPool;
  // The game's public address (SBR_PUBLIC_URL), e.g. https://example.org/games/bingo/; null in
  // development (the request's own origin and base path are used).
  readonly publicUrl: string | null;
  readonly basePath: string;
  // How many sign-ups the query reads ("Screens and texts", admin-area §4); the kit's page
  // keeps at most 20 of them.
  readonly screens: () => ScreenSettings;
}

const KINDS: Readonly<Record<string, string>> = {
  royale: 'Seasonal Bingo Royale',
  classic: 'Seasonal Bingo Classic',
  classicSeasons: 'Seasonal Bingo Seasons',
};

interface Row {
  id: string;
  code: string;
  title: string;
  game_type: string;
  start_at: Date | null;
  starts_at: Date | null;
  lobby_closes_at: Date | null;
  max_players: number;
  players: number;
}

// Open now, marked for the website, no test profile, no bots; soonest first.
const OPEN = `
  SELECT m.id, m.code, m.title, m.game_type, m.start_at, m.starts_at, m.lobby_closes_at,
         m.max_players, (SELECT count(*)::int FROM sbr.match_entries e WHERE e.match_id = m.id) AS players
    FROM sbr.matches m
   WHERE m.status = 'lobby' AND m.show_on_website AND m.starts_at IS NULL
     AND (m.lobby_closes_at IS NULL OR m.lobby_closes_at > now())
     AND m.ruleset_name NOT LIKE '%-test'
     AND NOT EXISTS (SELECT 1 FROM sbr.match_entries e WHERE e.match_id = m.id AND e.is_bot)
   ORDER BY coalesce(m.start_at, m.lobby_closes_at, m.created_at), m.created_at
   LIMIT $1`;

// One match as the kit's page takes it: times as Dates, the title whole (the kit cuts it).
function roundOf(row: Row, origin: string): OpenRoundInput {
  return {
    id: row.id,
    title: row.title,
    kind: KINDS[row.game_type] ?? 'Seasonal Bingo',
    startsAt: row.start_at,
    signupClosesAt: row.lobby_closes_at ?? row.start_at,
    players: row.players,
    maxPlayers: row.max_players,
    joinUrl: `${origin}#/match/${encodeURIComponent(row.code)}`,
  };
}

export function registerOpenRounds(app: FastifyInstance, deps: OpenRoundsDeps): void {
  app.get(
    '/api/public/open-rounds',
    { config: { rateLimit: { max: 60, timeWindow: 60_000 } } },
    async (request, reply): Promise<OpenRoundsPage> => {
      const page = deps.publicUrl ?? `https://${request.hostname}${deps.basePath}`;
      const rows = (await deps.pool.query<Row>(OPEN, [deps.screens().openRounds])).rows;
      reply.header('cache-control', OPEN_ROUNDS_CACHE_CONTROL);
      // A round the website would drop never leaves the game; the log names it by id only.
      return openRoundsPage(
        rows.map((row) => roundOf(row, page)),
        {
          origin: page,
          onDrop: (id, why) => {
            request.log.warn({ round: id, why }, 'open round left out of the website page');
          },
        },
      );
    },
  );
}
