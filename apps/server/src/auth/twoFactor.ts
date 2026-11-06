/**
 * @file   apps/server/src/auth/twoFactor.ts
 * @module server/auth
 * @brief  Admin two-factor sign-in (TOTP) of standalone installs (D60): enrol, confirm, verify, reset.
 *
 * Responsibility: `enrol`: a new secret for the account (replacing an unconfirmed one), sealed
 *                 with the install's secret key bound to the account (../match/codec
 *                 encryptSeed), and the link and QR code for the authenticator. `confirm`: the
 *                 first code makes the factor live and returns ten single-use recovery codes
 *                 (only their SHA-256 stored). `verify`: a code (never one at or before the last
 *                 step used) or an unused recovery code. Each success marks the session's second
 *                 step done (sessions.last_2fa_at). `resetTwoFactor`: removes factor and codes
 *                 of an account by display name and ends its sessions (sbr admin reset-2fa).
 * Depends on:     node:crypto, qrcode, ../db/pool, ../match/codec, ./sessions, ./totp
 * Used by:        ../http/routes/twoFactor, ../http/routes/auth (status), ../cli
 * Spec:           docs/spec/03-security-architecture.md §1; docs/spec/04-database-design.md §3.1
 */
import { createHash, randomBytes } from 'node:crypto';

import QRCode from 'qrcode';

import type { DbPool } from '../db/pool.js';
import { decryptSeed, encryptSeed } from '../match/codec.js';
import { accountSessionIds, revokeSession } from './sessions.js';
import { matchingStep, newSecret, otpauthUri } from './totp.js';

const ISSUER = 'Seasonal Bingo Royale';

const hashOf = (code: string): Buffer =>
  createHash('sha256').update(code.replace(/[\s-]/g, '').toLowerCase()).digest();

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
  key: Buffer,
  who: { readonly accountId: string; readonly sessionId: string },
  code: string,
): Promise<readonly string[] | null> {
  const factor = await factorOf(pool, key, who.accountId);
  if (factor === null || factor.confirmed) return null;
  const step = matchingStep(factor.secret, code, Date.now(), factor.lastStep);
  if (step === null) return null;
  const codes = Array.from({ length: 10 }, () => randomBytes(5).toString('hex'));
  await pool.query(
    'UPDATE sbr.totp_factors SET confirmed_at = now(), last_used_step = $2 WHERE account_id = $1',
    [who.accountId, step],
  );
  await pool.query('DELETE FROM sbr.recovery_codes WHERE account_id = $1', [who.accountId]);
  await pool.query(
    'INSERT INTO sbr.recovery_codes (account_id, code_hash) SELECT $1, unnest($2::bytea[])',
    [who.accountId, codes.map(hashOf)],
  );
  await markSession(pool, who.sessionId);
  return codes;
}

// A code or an unused recovery code; true marks the session's second step done.
export async function verify(
  pool: DbPool,
  key: Buffer,
  who: { readonly accountId: string; readonly sessionId: string },
  answer: { readonly code?: string | undefined; readonly recoveryCode?: string | undefined },
): Promise<boolean> {
  const factor = await factorOf(pool, key, who.accountId);
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
    const r = await pool.query(
      `UPDATE sbr.recovery_codes SET used_at = now()
        WHERE account_id = $1 AND code_hash = $2 AND used_at IS NULL`,
      [who.accountId, hashOf(answer.recoveryCode)],
    );
    ok = (r.rowCount ?? 0) > 0;
  }
  if (ok) await markSession(pool, who.sessionId);
  return ok;
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
