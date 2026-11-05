/**
 * @file   apps/server/src/website/accountChanges.ts
 * @module server/website
 * @brief  One change from the website's account-changes feed applied to the linked game account.
 *
 * Responsibility: find the game account of website id String(id) (the website's identity
 *                 provider, by the site origin); an id linked to none is skipped. Every kind
 *                 revokes all the account's sessions at once and closes their sockets (the
 *                 existing revoke, ../auth/sessions, and the session-end hub the gateway
 *                 listens to): a player in a running match keeps card and results and returns
 *                 after signing in again; a locked account gets a guest answer from the website
 *                 and stays a guest. "deleted" also deletes the game account through the
 *                 existing path (../auth/accounts deleteAccount: points stay in past rounds and
 *                 histories under a "deleted player" name, it leaves the leaderboard; the event
 *                 log is never rewritten) and keeps the website id in sbr.website_deleted, so a
 *                 later sign-in with it is refused.
 * Depends on:     ../auth/accounts, ../auth/sessions, ../auth/sessionEnds (types), ../db/pool
 * Used by:        ./accountFeed
 * Spec:           docs/spec/07-integration-architecture.md §2.4; docs/spec/03-security-architecture.md §19
 */
import { deleteAccount } from '../auth/accounts.js';
import type { SessionEnds } from '../auth/sessionEnds.js';
import { accountSessionIds, revokeSession } from '../auth/sessions.js';
import type { DbPool } from '../db/pool.js';

export const KINDS = ['deleted', 'locked', 'unlocked', 'rights'] as const;

export interface ChangeDeps {
  readonly pool: DbPool;
  // The site origin: the website's identity provider (../auth/websiteAccounts).
  readonly issuer: string;
  readonly sessionEnds: SessionEnds;
  // The live views forget the account's name at once (../view/liveViews accountGone).
  readonly accountDeleted: (accountId: string) => void;
}

async function linkedAccount(deps: ChangeDeps, subject: string): Promise<string | null> {
  const r = await deps.pool.query<{ account_id: string }>(
    `SELECT e.account_id FROM sbr.external_identities e
       JOIN sbr.identity_providers p ON p.id = e.provider_id
      WHERE p.issuer = $1 AND e.subject = $2`,
    [deps.issuer, subject],
  );
  return r.rows[0]?.account_id ?? null;
}

export async function applyChange(
  deps: ChangeDeps,
  change: { readonly id: number; readonly kind: string },
): Promise<void> {
  const subject = String(change.id);
  const accountId = await linkedAccount(deps, subject);
  if (accountId === null) return;
  const sessions = await accountSessionIds(deps.pool, accountId);
  for (const id of sessions) await revokeSession(deps.pool, id);
  if (change.kind === 'deleted') {
    await deps.pool.query(
      `INSERT INTO sbr.website_deleted (issuer, subject) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [deps.issuer, subject],
    );
    await deleteAccount(deps.pool, accountId);
    deps.accountDeleted(accountId);
  }
  deps.sessionEnds.end(sessions);
}
