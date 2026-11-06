/**
 * @file   apps/server/src/auth/passwordReset.ts
 * @module server/auth
 * @brief  Password reset by e-mail for local accounts (standalone installs, D60; 03 §1).
 *
 * Responsibility: `requestReset`: for an active local account with a password, a random token
 *                 (32 bytes, base64url) whose SHA-256 alone is stored, valid 1 hour, and an e-mail
 *                 with the link <public address>#/reset-password?token=…; for any other address
 *                 nothing (the caller answers the same either way). `completeReset`: a token
 *                 that exists, is unused and unexpired sets the new password (the password rules
 *                 of ./password), marks it and every other open token of the account used, and
 *                 returns the account's sessions to end. Constant work per token; no reveal.
 * Depends on:     node:crypto, ../db/pool, ./password, ./sessions, ./mailer (types)
 * Used by:        ../http/routes/passwordReset
 * Spec:           docs/spec/03-security-architecture.md §1; docs/spec/04-database-design.md §3.1
 */
import { createHash, randomBytes } from 'node:crypto';

import type { DbPool } from '../db/pool.js';
import type { Mailer } from './mailer.js';
import { hashPassword, passwordProblem, type PasswordProblem } from './password.js';
import { accountSessionIds, revokeSession } from './sessions.js';

const VALID_MS = 60 * 60_000;

const hashOf = (token: string): Buffer => createHash('sha256').update(token).digest();

interface ResetDeps {
  readonly pool: DbPool;
  readonly mailer: Mailer;
  // Where the link points: the game's public address (its #/reset-password page).
  readonly pageUrl: string;
}

// The account that may reset its password by this e-mail, or null.
async function resettable(pool: DbPool, email: string): Promise<{ id: string } | null> {
  const r = await pool.query<{ id: string }>(
    `SELECT id FROM sbr.accounts
      WHERE email = $1 AND status = 'active' AND password_hash IS NOT NULL`,
    [email],
  );
  return r.rows[0] ?? null;
}

export async function requestReset(deps: ResetDeps, email: string): Promise<void> {
  const account = await resettable(deps.pool, email);
  if (account === null) return;
  const token = randomBytes(32).toString('base64url');
  await deps.pool.query(
    `INSERT INTO sbr.password_reset_tokens (token_hash, account_id, expires_at)
     VALUES ($1, $2, now() + make_interval(secs => $3))`,
    [hashOf(token), account.id, VALID_MS / 1000],
  );
  const link = `${deps.pageUrl}#/reset-password?token=${token}`;
  await deps.mailer.send(
    email,
    'Reset your Seasonal Bingo Royale password',
    `Someone asked to reset the password of your Seasonal Bingo Royale account.\n\n` +
      `To choose a new password, open this link within one hour:\n${link}\n\n` +
      `If it was not you, ignore this e-mail; your password stays as it is.\n`,
  );
}

export type ResetResult =
  | { readonly ok: true; readonly accountId: string; readonly sessions: readonly string[] }
  | { readonly ok: false; readonly code: 'RESET_INVALID' }
  | { readonly ok: false; readonly code: 'PASSWORD_WEAK'; readonly reason: PasswordProblem };

export async function completeReset(
  pool: DbPool,
  token: string,
  password: string,
): Promise<ResetResult> {
  const problem = passwordProblem(password);
  if (problem !== null) return { ok: false, code: 'PASSWORD_WEAK', reason: problem };
  const encoded = await hashPassword(password);
  const r = await pool.query<{ account_id: string }>(
    `WITH t AS (
       UPDATE sbr.password_reset_tokens SET used_at = now()
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
        RETURNING account_id),
     others AS (
       UPDATE sbr.password_reset_tokens o SET used_at = now()
         FROM t WHERE o.account_id = t.account_id AND o.used_at IS NULL AND o.token_hash <> $1),
     pw AS (
       UPDATE sbr.accounts a SET password_hash = $2, updated_at = now()
         FROM t WHERE a.id = t.account_id AND a.status = 'active' RETURNING a.id)
     SELECT id AS account_id FROM pw`,
    [hashOf(token), encoded],
  );
  const accountId = r.rows[0]?.account_id;
  if (accountId === undefined) return { ok: false, code: 'RESET_INVALID' };
  // Every session of the account ends (the existing revoke, ./sessions).
  const sessions = await accountSessionIds(pool, accountId);
  for (const id of sessions) await revokeSession(pool, id);
  return { ok: true, accountId, sessions };
}
