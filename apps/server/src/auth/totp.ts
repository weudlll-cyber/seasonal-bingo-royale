/**
 * @file   apps/server/src/auth/totp.ts
 * @module server/auth
 * @brief  TOTP (RFC 6238 over RFC 4226): secrets, the authenticator link, checking a code.
 *
 * Responsibility: a 20-byte random secret in base32 (what authenticator apps take), the
 *                 otpauth:// link for the QR code, the 6-digit code of a 30-second step
 *                 (HMAC-SHA1, dynamic truncation), and `matchingStep`: the step a code belongs
 *                 to within one step either side of now, never one at or before the last step
 *                 used (no code twice). Constant-time comparison. No I/O.
 * Depends on:     node:crypto
 * Used by:        ./twoFactor, ./totp.test
 * Spec:           docs/spec/03-security-architecture.md §1
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_MS = 30_000;

export function base32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(value >> bits) & 31] ?? '';
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31] ?? '';
  return out;
}

export function newSecret(): Uint8Array {
  return new Uint8Array(randomBytes(20));
}

// The link an authenticator app reads from the QR code.
export function otpauthUri(secret: Uint8Array, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const query = new URLSearchParams({ secret: base32(secret), issuer, digits: '6', period: '30' });
  return `otpauth://totp/${label}?${query.toString()}`;
}

export const stepAt = (ms: number): number => Math.floor(ms / STEP_MS);

export function codeAt(secret: Uint8Array, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', secret).update(counter).digest();
  const offset = (mac[mac.length - 1] ?? 0) & 0x0f;
  const binary = mac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 1_000_000).padStart(6, '0');
}

// The step `code` belongs to (now ± 1), later than `lastStep`; null for none.
export function matchingStep(
  secret: Uint8Array,
  code: string,
  now: number,
  lastStep: number | null,
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const sent = Buffer.from(code);
  const current = stepAt(now);
  for (const step of [current - 1, current, current + 1]) {
    if (lastStep !== null && step <= lastStep) continue;
    if (timingSafeEqual(Buffer.from(codeAt(secret, step)), sent)) return step;
  }
  return null;
}
