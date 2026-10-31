/**
 * @file   apps/server/src/http/routes/matchVerify.ts
 * @module server/http
 * @brief  GET /api/v1/matches/:code/verify — the seed revealed after the end, and the match recomputed from it.
 *
 * Responsibility: for anyone, once the match has finished or was cancelled: decrypt the stored
 *                 seed (../../match/codec openSeedColumn), recompute every round's draw order,
 *                 the draws made and every card with the domain's verifyMatch against the
 *                 commitment published at match open, and answer the contracts'
 *                 MatchVerificationView. Before the end: 409 MATCH_NOT_OVER, seed stays sealed
 *                 (01 §9). The answer is computed once per finished match and cached (newest
 *                 500); the route has its own limit on top of the API's (20 a minute per address,
 *                 429 RATE_LIMITED; @fastify/rate-limit, 03 §13).
 * Depends on:     fastify, @sbr/contracts (types), @sbr/domain, ../../db/pool,
 *                 ../../match/codec, ../../match/pgMatchStore
 * Used by:        ../app
 * Spec:           docs/spec/01-game-design.md §9; docs/spec/05-api-design.md §2.3, §2.3a; docs/spec/03-security-architecture.md §9
 */
import type { MatchVerificationView } from '@sbr/contracts';
import { verifyMatch, type DomainEvent, type LobbyOpened } from '@sbr/domain';
import type { FastifyInstance } from 'fastify';

import type { DbPool } from '../../db/pool.js';
import { openSeedColumn } from '../../match/codec.js';
import type { PgMatchStore } from '../../match/pgMatchStore.js';

interface VerifyRouteDeps {
  readonly pool: DbPool;
  readonly store: PgMatchStore;
  readonly seedKey: Buffer;
}

interface SealedRow {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly status: string;
  readonly game_type: string;
  readonly seed_commitment: Buffer;
  readonly seed_enc: Buffer;
  readonly seed_enc_version: number;
}

// Per address and minute: plenty for a person checking matches, little for a flood.
const VERIFY_LIMIT = { max: 20, timeWindow: 60_000 };

// Finished and cancelled are final, so a match's answer never changes: each is computed
// once and kept, the newest VERIFIED_KEPT of them (the oldest leaves first). The promise is
// kept, so calls that arrive together share one computation; a failed one is forgotten.
const VERIFIED_KEPT = 500;

class VerifiedAnswers {
  private readonly kept = new Map<string, Promise<MatchVerificationView>>();

  of(
    matchId: string,
    compute: () => Promise<MatchVerificationView>,
  ): Promise<MatchVerificationView> {
    const known = this.kept.get(matchId);
    if (known !== undefined) return known;
    const answer = compute();
    this.kept.set(matchId, answer);
    answer.catch(() => {
      this.kept.delete(matchId);
    });
    const oldest = this.kept.keys().next().value;
    if (this.kept.size > VERIFIED_KEPT && oldest !== undefined) this.kept.delete(oldest);
    return answer;
  }
}

export function registerVerifyRoute(app: FastifyInstance, deps: VerifyRouteDeps): void {
  // The per-route limit (@fastify/rate-limit, registered by ../app).
  const config = { rateLimit: VERIFY_LIMIT };
  const answers = new VerifiedAnswers();
  app.get<{ Params: { code: string } }>(
    '/api/v1/matches/:code/verify',
    { config },
    async (request, reply) => {
      const r = await deps.pool.query<SealedRow>(
        `SELECT id, code, title, status, game_type, seed_commitment, seed_enc, seed_enc_version
         FROM sbr.matches WHERE code = $1`,
        [request.params.code],
      );
      const row = r.rows[0];
      if (row === undefined) return reply.status(404).send({ code: 'NOT_FOUND' });
      // The seed is revealed only once the match is over (01 §9).
      const status = row.status;
      if (status !== 'finished' && status !== 'aborted') {
        return reply.status(409).send({ code: 'MATCH_NOT_OVER' });
      }
      return answers.of(row.id, async () => {
        const events = (await deps.store.events(row.id, 0)).map((e) => e.event);
        return verificationOf(row, status, openSeedColumn(row, deps.seedKey), events);
      });
    },
  );
}

function verificationOf(
  row: SealedRow,
  status: 'finished' | 'aborted',
  seed: Uint8Array,
  events: readonly DomainEvent[],
): MatchVerificationView {
  const commitment = new Uint8Array(row.seed_commitment);
  const result = verifyMatch({ seed, commitment, events });
  // The numbers drawn per round, in log order, for the bundle.
  const draws = new Map<number, number[]>();
  let round = -1;
  for (const e of events) {
    if (e.type === 'roundStarted') round = e.roundIndex;
    else if (e.type === 'drawMade') draws.set(round, [...(draws.get(round) ?? []), e.item]);
  }
  const opened = events.find((e): e is LobbyOpened => e.type === 'lobbyOpened');
  return {
    code: row.code,
    title: row.title,
    status,
    gameType: row.game_type,
    commitment: Buffer.from(commitment).toString('hex'),
    seed: Buffer.from(seed).toString('hex'),
    commitmentMatches: result.commitmentMatches,
    ruleset: opened?.ruleset ?? null,
    rounds: result.rounds.map((check) => ({ ...check, draws: draws.get(check.roundIndex) ?? [] })),
    verified: result.verified,
  };
}
