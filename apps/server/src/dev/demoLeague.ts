/**
 * @file   apps/server/src/dev/demoLeague.ts
 * @module server/dev
 * @brief  Development-only demo league: ten verified dev accounts and three counting royales.
 *
 * Responsibility: POST /api/v1/dev/demo-league creates (or reuses) `demo-01` … `demo-10` with
 *                 a confirmed e-mail address and starts three short royales among them (the
 *                 fast test rules, leaderboard switch on, no bots, timed draws, missed numbers
 *                 marked after 3 s) that the server's scheduler plays to the end like any
 *                 match, so the boards, profiles and badges fill with real data. DELETE removes
 *                 the accounts with their league and badge rows; matches still running
 *                 are aborted by the system, finished ones stay (append-only event log, 04 §3.3).
 * Depends on:     fastify, @sbr/application (types), @sbr/contracts, ../auth/accounts,
 *                 ../db/pool, ./fastRulesets
 * Used by:        ../http/app (with SBR_DEV=1 only), ../../demo-league.mjs (console command)
 * Spec:           docs/spec/01-game-design.md §10; docs/spec/12-testing-strategy.md §8
 */
import type { MatchEngine } from '@sbr/application';
import { START_COUNTDOWN_MS } from '@sbr/contracts';
import type { FastifyInstance } from 'fastify';

import { deleteAccount, ensureDevAccount } from '../auth/accounts.js';
import type { DbPool } from '../db/pool.js';
import { fastRuleset } from './fastRulesets.js';

const DEMO_NAMES = Array.from({ length: 10 }, (_, i) => `demo-${String(i + 1).padStart(2, '0')}`);
const MATCHES = 3;

interface DemoDeps {
  readonly pool: DbPool;
  readonly engine: MatchEngine;
}

export function registerDemoLeague(app: FastifyInstance, deps: DemoDeps): void {
  // Called from the console (../../demo-league.mjs), outside any session: no CSRF token.
  const config = { noCsrf: true, rateLimit: { max: 5, timeWindow: 60_000 } };
  app.post('/api/v1/dev/demo-league', { config }, async (_request, reply) =>
    reply.status(202).send({ accounts: DEMO_NAMES, matches: await startDemoLeague(deps) }),
  );
  app.delete('/api/v1/dev/demo-league', { config }, async () => removeDemoLeague(deps));
}

// The codes of the three matches, started; the scheduler plays them on.
async function startDemoLeague(deps: DemoDeps): Promise<string[]> {
  const ids: string[] = [];
  for (const name of DEMO_NAMES) ids.push(await ensureDevAccount(deps.pool, name, []));
  // League points need confirmed e-mail addresses (03 §11).
  await deps.pool.query(
    'UPDATE sbr.accounts SET email_verified_at = now() WHERE id = ANY($1) AND email_verified_at IS NULL',
    [ids],
  );
  const codes: string[] = [];
  for (let n = 1; n <= MATCHES; n += 1) {
    const record = await deps.engine.create(
      {
        title: `Demo league ${String(n)}`,
        gameType: 'royale',
        drawMode: 'auto',
        // The shortest gap: the 3 s speed window and the 3 s mark delay + 1 s (D12).
        drawIntervalMs: 4_000,
        missedNumbers: { kind: 'autoMarkAfter', delayMs: 3_000 },
        countsForLeaderboard: true,
        maxPlayers: DEMO_NAMES.length,
        roundPause: { kind: 'wait', ms: 3_000 },
        ruleset: fastRuleset('royale') ?? undefined,
      },
      null,
    );
    for (const id of ids) await deps.engine.join(record.id, id, true);
    await deps.engine.start(record.id, START_COUNTDOWN_MS);
    codes.push(record.code);
  }
  return codes;
}

// Removes the demo accounts; matches still running are aborted, finished ones stay.
async function removeDemoLeague(
  deps: DemoDeps,
): Promise<{ readonly removed: readonly string[]; readonly aborted: number }> {
  const found = await deps.pool.query<{ id: string; display_name: string }>(
    'SELECT id, display_name FROM sbr.accounts WHERE display_name_key = ANY($1)',
    [DEMO_NAMES],
  );
  const ids = found.rows.map((r) => r.id);
  const open = await deps.pool.query<{ id: string }>(
    `SELECT DISTINCT m.id FROM sbr.match_entries e JOIN sbr.matches m ON m.id = e.match_id
      WHERE e.account_id = ANY($1) AND m.status IN ('scheduled', 'lobby', 'running')`,
    [ids],
  );
  for (const { id } of open.rows) {
    await deps.engine.abort(id, 'Demo league removed', 'system');
  }
  // The account goes with its league entries, awards and badges (cascade); its
  // match entries stay without the account (../auth/accounts deleteAccount).
  for (const id of ids) await deleteAccount(deps.pool, id);
  return { removed: found.rows.map((r) => r.display_name), aborted: open.rows.length };
}
