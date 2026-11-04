/**
 * @file   apps/server/src/loadcheck/accounts.ts
 * @module server/loadcheck
 * @brief  The operator's load check (`sbr loadcheck`): when it may run, its accounts, its cleanup.
 *
 * Responsibility: `loadCheckRefusal` says why the check must not run now: real players in a
 *                 match that is not over, or, with maintenance off, people signed in (12 §5).
 *                 `createLoadAccounts` makes a host (organizer) and the players and spectators,
 *                 all with the role `load_check`, no e-mail and no password (nobody can sign in
 *                 as them), each with one session; it returns the session cookies and CSRF
 *                 tokens for the load generator, never logged. `removeLoadCheck` aborts every
 *                 match a load account hosts that is not over (the event log is append-only:
 *                 aborted, never deleted, 04 §3.3), removes the accounts with their sessions
 *                 and roles (./auth/accounts deleteAccount keeps the matches' entries without
 *                 the account) and verifies that none is left. Operator-only: the CLI inside
 *                 the app container calls these, never an HTTP route.
 * Depends on:     @sbr/application (types), ../auth/accounts, ../auth/sessions, ../db/pool
 * Used by:        ../cli (loadcheck), test/loadCheck.integration.test.ts
 * Spec:           docs/spec/12-testing-strategy.md §5; docs/spec/09-deployment-architecture.md §4
 */
import type { MatchEngine } from '@sbr/application';

import { deleteAccount } from '../auth/accounts.js';
import { createSession } from '../auth/sessions.js';
import type { DbPool } from '../db/pool.js';

export const LOAD_ROLE = 'load_check';
const NAME_PREFIX = 'loadcheck-';

export interface LoadClient {
  readonly name: string;
  // "<cookie name>=<session token>", as a browser would send it.
  readonly cookie: string;
  readonly csrf: string;
}

export interface LoadAccounts {
  readonly host: LoadClient;
  readonly players: readonly LoadClient[];
  readonly spectators: readonly LoadClient[];
}

const NOT_LOAD = `NOT EXISTS (SELECT 1 FROM sbr.role_assignments r
                  WHERE r.account_id = a.id AND r.role_id = '${LOAD_ROLE}')`;

// Why the load check must not run now, or null (12 §5).
export async function loadCheckRefusal(
  pool: DbPool,
  maintenanceOn: boolean,
): Promise<string | null> {
  const playing = await pool.query<{ n: number }>(
    `SELECT count(DISTINCT a.id)::int AS n
       FROM sbr.match_entries e
       JOIN sbr.matches m ON m.id = e.match_id
       JOIN sbr.accounts a ON a.id = e.account_id
      WHERE m.status IN ('lobby', 'running') AND ${NOT_LOAD}`,
  );
  const inMatch = playing.rows[0]?.n ?? 0;
  if (inMatch > 0) {
    return `${String(inMatch)} player(s) are in a match that is not over: run the load check when every match has ended`;
  }
  if (maintenanceOn) return null;
  const online = await pool.query<{ n: number }>(
    `SELECT count(DISTINCT a.id)::int AS n
       FROM sbr.sessions s
       JOIN sbr.accounts a ON a.id = s.account_id
      WHERE s.revoked_at IS NULL AND s.expires_at > now() AND s.idle_expires_at > now()
        AND ${NOT_LOAD}`,
  );
  const signedIn = online.rows[0]?.n ?? 0;
  return signedIn > 0
    ? `${String(signedIn)} account(s) are signed in and maintenance is off: turn maintenance on first (sudo sbr maintenance on "Load check")`
    : null;
}

// One load account with its roles and a session.
async function loadAccount(
  pool: DbPool,
  name: string,
  roles: readonly string[],
  cookieName: string,
): Promise<LoadClient> {
  // The account and its roles in one statement: none exists without the load_check mark.
  const made = await pool.query<{ account_id: string }>(
    `WITH a AS (
       INSERT INTO sbr.accounts (display_name, display_name_key) VALUES ($1::text, $1::text) RETURNING id
     )
     INSERT INTO sbr.role_assignments (account_id, role_id)
     SELECT a.id, r FROM a, unnest($2::text[]) AS r
     RETURNING account_id`,
    [name, [...roles, LOAD_ROLE]],
  );
  const id = made.rows[0]?.account_id ?? '';
  const session = await createSession(pool, id, 'sbr loadcheck');
  return { name, cookie: `${cookieName}=${session.token}`, csrf: session.csrfToken };
}

export async function createLoadAccounts(
  pool: DbPool,
  counts: { readonly players: number; readonly spectators: number },
  cookieName: string,
): Promise<LoadAccounts> {
  const numbered = (i: number) => `${NAME_PREFIX}${String(i + 1).padStart(3, '0')}`;
  const host = await loadAccount(pool, `${NAME_PREFIX}host`, ['organizer'], cookieName);
  const players: LoadClient[] = [];
  for (let i = 0; i < counts.players; i += 1) {
    players.push(await loadAccount(pool, numbered(i), ['player'], cookieName));
  }
  const spectators: LoadClient[] = [];
  for (let i = counts.players; i < counts.players + counts.spectators; i += 1) {
    spectators.push(await loadAccount(pool, numbered(i), ['player'], cookieName));
  }
  return { host, players, spectators };
}

export interface LoadCheckRemoval {
  readonly aborted: number;
  readonly removed: number;
  // What is left after the removal: load accounts, their sessions, their open matches.
  readonly left: { readonly accounts: number; readonly sessions: number; readonly matches: number };
}

const LOAD_IDS = `SELECT account_id FROM sbr.role_assignments WHERE role_id = '${LOAD_ROLE}'`;

// Aborts the load accounts' open matches, removes the accounts, counts what is left.
export async function removeLoadCheck(
  pool: DbPool,
  engine: MatchEngine,
): Promise<LoadCheckRemoval> {
  const open = await pool.query<{ id: string }>(
    `SELECT id FROM sbr.matches WHERE status IN ('lobby', 'running') AND created_by IN (${LOAD_IDS})`,
  );
  for (const { id } of open.rows) await engine.abort(id, 'load check done', 'system');
  const ids = await pool.query<{ account_id: string }>(LOAD_IDS);
  for (const { account_id } of ids.rows) await deleteAccount(pool, account_id);
  const left = await pool.query<{ accounts: number; sessions: number; matches: number }>(
    `SELECT (SELECT count(*) FROM sbr.accounts WHERE id IN (${LOAD_IDS}))::int AS accounts,
            (SELECT count(*) FROM sbr.sessions WHERE account_id IN (${LOAD_IDS}))::int AS sessions,
            (SELECT count(*) FROM sbr.matches
              WHERE status IN ('lobby', 'running') AND created_by IN (${LOAD_IDS}))::int AS matches`,
  );
  return {
    aborted: open.rows.length,
    removed: ids.rows.length,
    left: left.rows[0] ?? { accounts: 0, sessions: 0, matches: 0 },
  };
}
