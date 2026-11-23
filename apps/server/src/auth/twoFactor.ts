/**
 * @file   apps/server/src/auth/twoFactor.ts
 * @module server/auth
 * @brief  Admin two-factor sign-in (TOTP) of standalone installs (D60): enrol, confirm, verify, reset.
 *
 * Responsibility: `enrol`: a new secret for the account (replacing an unconfirmed one), sealed
 *                 with the install's secret key bound to the account (../match/codec
 *                 encryptSeed), and the link and QR code for the authenticator. `confirm`: the
 *                 first code makes the factor live and returns ten single-use recovery codes
 *                 (the kit's 'hex' codes; only their HMAC under the install's recovery key is
 *                 stored, K20). `verify`: a code (never one at or before the last step used) or
 *                 an unused recovery code, stored keyed or as the plain SHA-256 of before (K27:
 *                 those keep working until used). Each success marks the session's second
 *                 step done (sessions.last_2fa_at). `recoveryCodeStored`: the same lookup, read
 *                 only (the restore drill's check). `resetTwoFactor`: removes factor and codes
 *                 of an account by display name and ends its sessions (sbr admin reset-2fa).
 * Depends on:     qrcode, @seasonal/kit/server (TOTP, recovery codes), ../db/pool, ../match/codec,
 *                 ./sessions
 * Used by:        ../http/routes/twoFactor, ../http/routes/auth (status), ../cli
 * Spec:           docs/spec/03-security-architecture.md §1; docs/spec/04-database-design.md §3.1
 */
import {
  matchingStep,
  newRecoveryCodes,
  newSecret,
  otpauthUri,
  recoveryHash,
  recoveryLookups,
} from '@seasonal/kit/server';
import QRCode from 'qrcode';

import type { DbPool } from '../db/pool.js';
import { decryptSeed, encryptSeed } from '../match/codec.js';
import { accountSessionIds, revokeSession } from './sessions.js';

const ISSUER = 'Seasonal Bingo Royale';

// The install's two keys: the seed key seals the TOTP secret, the recovery key keys the codes.
export interface TwoFactorKeys {
  readonly seal: Buffer;
  readonly recovery: Buffer;
}

interface Factor {
  readonly secret: Uint8Array;
  readonly confirmed: boolean;
  readonly lastStep: number | null;
}

async function factorOf(pool: DbPool, key: Buffer, accountId: string): Promise<Factor | null> {
  const r = await pool.query<{
    secret_enc: Buffer;
    confirmed_at: Date | null;
    last_used_step: string | null;
  }>(
    'SELECT secret_enc, confirmed_at, last_used_step FROM sbr.totp_factors WHERE account_id = $1',
    [accountId],
  );
  const row = r.rows[0];
  if (row === undefined) return null;
  return {
    secret: decryptSeed(row.secret_enc, key, accountId),
    confirmed: row.confirmed_at !== null,
    lastStep: row.last_used_step === null ? null : Number(row.last_used_step),
  };
}

// 'code' once a factor is confirmed, else 'enrol'.
export async function twoFactorStep(pool: DbPool, accountId: string): Promise<'enrol' | 'code'> {
  const r = await pool.query(
    'SELECT 1 FROM sbr.totp_factors WHERE account_id = $1 AND confirmed_at IS NOT NULL',
    [accountId],
  );
  return (r.rowCount ?? 0) > 0 ? 'code' : 'enrol';
}

export async function enrol(pool: DbPool, key: Buffer, accountId: string, name: string) {
  const secret = newSecret();
  await pool.query(
    `INSERT INTO sbr.totp_factors (account_id, secret_enc) VALUES ($1, $2)
     ON CONFLICT (account_id) DO UPDATE SET secret_enc = EXCLUDED.secret_enc, last_used_step = NULL
       WHERE sbr.totp_factors.confirmed_at IS NULL`,
    [accountId, encryptSeed(secret, key, accountId)],
  );
  const uri = otpauthUri(secret, name, ISSUER);
  const qrSvg = await QRCode.toString(uri, { type: 'svg', margin: 1 });
  return { uri, qrSvg };
}

const markSession = (pool: DbPool, sessionId: string) =>
  pool.query('UPDATE sbr.sessions SET last_2fa_at = now() WHERE id = $1', [sessionId]);

// The first code of an unconfirmed factor: live, ten recovery codes (shown once), or null.
export async function confirm(
  pool: DbPool,
  keys: TwoFactorKeys,
  who: { readonly accountId: string; readonly sessionId: string },
  code: string,
): Promise<readonly string[] | null> {
  const factor = await factorOf(pool, keys.seal, who.accountId);
  if (factor === null || factor.confirmed) return null;
  const step = matchingStep(factor.secret, code, Date.now(), factor.lastStep);
  if (step === null) return null;
  const codes = newRecoveryCodes('hex');
  await pool.query(
    'UPDATE sbr.totp_factors SET confirmed_at = now(), last_used_step = $2 WHERE account_id = $1',
    [who.accountId, step],
  );
  await pool.query('DELETE FROM sbr.recovery_codes WHERE account_id = $1', [who.accountId]);
  await pool.query(
    'INSERT INTO sbr.recovery_codes (account_id, code_hash) SELECT $1, unnest($2::bytea[])',
    [who.accountId, codes.map((c) => recoveryHash(c, 'hex', keys.recovery))],
  );
  await markSession(pool, who.sessionId);
  return codes;
}

// A code or an unused recovery code; true marks the session's second step done.
export async function verify(
  pool: DbPool,
  keys: TwoFactorKeys,
  who: { readonly accountId: string; readonly sessionId: string },
  answer: { readonly code?: string | undefined; readonly recoveryCode?: string | undefined },
): Promise<boolean> {
  const factor = await factorOf(pool, keys.seal, who.accountId);
  if (factor === null || !factor.confirmed) return false;
  let ok = false;
  if (answer.code !== undefined) {
    const step = matchingStep(factor.secret, answer.code, Date.now(), factor.lastStep);
    if (step !== null) {
      const r = await pool.query(
        `UPDATE sbr.totp_factors SET last_used_step = $2
          WHERE account_id = $1 AND (last_used_step IS NULL OR last_used_step < $2)`,
        [who.accountId, step],
      );
      ok = (r.rowCount ?? 0) > 0;
    }
  } else if (answer.recoveryCode !== undefined) {
    // The keyed hash or the plain one of before: one statement, so either is used up once.
    const r = await pool.query(
      `UPDATE sbr.recovery_codes SET used_at = now()
        WHERE account_id = $1 AND code_hash = ANY($2::bytea[]) AND used_at IS NULL`,
      [who.accountId, recoveryLookups(answer.recoveryCode, 'hex', keys.recovery)],
    );
    ok = (r.rowCount ?? 0) > 0;
  }
  if (ok) await markSession(pool, who.sessionId);
  return ok;
}

// Whether `code` matches an unused stored recovery code of the account, keyed or legacy (the
// same lookup as `verify`), without using it: the restore drill's proof that a backup brought
// the recovery key with its codes (../cli check-recovery-code).
export async function recoveryCodeStored(
  pool: DbPool,
  recoveryKey: Buffer,
  displayName: string,
  code: string,
): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM sbr.recovery_codes c JOIN sbr.accounts a ON a.id = c.account_id
      WHERE a.display_name_key = $1 AND c.code_hash = ANY($2::bytea[]) AND c.used_at IS NULL`,
    [displayName, recoveryLookups(code, 'hex', recoveryKey)],
  );
  return (r.rowCount ?? 0) > 0;
}

// sbr admin reset-2fa: the factor and codes of the account gone, its sessions ended; false
// for an unknown name.
export async function resetTwoFactor(pool: DbPool, displayName: string): Promise<boolean> {
  const r = await pool.query<{ id: string }>(
    'SELECT id FROM sbr.accounts WHERE display_name_key = $1',
    [displayName],
  );
  const id = r.rows[0]?.id;
  if (id === undefined) return false;
  await pool.query('DELETE FROM sbr.totp_factors WHERE account_id = $1', [id]);
  await pool.query('DELETE FROM sbr.recovery_codes WHERE account_id = $1', [id]);
  for (const session of await accountSessionIds(pool, id)) await revokeSession(pool, session);
  return true;
}
