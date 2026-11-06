/**
 * @file   apps/server/src/auth/totp.test.ts
 * @module server/auth
 * @brief  TOTP matches RFC 6238's test vector and accepts a code once, within one step.
 *
 * Responsibility: the RFC's SHA-1 vectors (secret "12345678901234567890"), base32 of a known
 *                 value, a code accepted one step either side and refused further away, and a
 *                 step at or before the last one used refused (no code twice).
 * Depends on:     vitest, ./totp
 * Spec:           docs/spec/03-security-architecture.md §1
 */
import { describe, expect, it } from 'vitest';

import { base32, codeAt, matchingStep, stepAt } from './totp.js';

const RFC_SECRET = new Uint8Array(Buffer.from('12345678901234567890'));

describe('TOTP (RFC 6238)', () => {
  it("gives the RFC's codes and base32", () => {
    // RFC 6238 appendix B, SHA-1, T = 59 s and 1111111109 s (8 digits there; the last 6 here).
    expect(codeAt(RFC_SECRET, stepAt(59_000))).toBe('287082');
    expect(codeAt(RFC_SECRET, stepAt(1_111_111_109_000))).toBe('081804');
    expect(base32(new Uint8Array(Buffer.from('foobar')))).toBe('MZXW6YTBOI');
  });

  it('accepts a code one step either side, once', () => {
    const now = 1_700_000_000_000;
    const step = stepAt(now);
    expect(matchingStep(RFC_SECRET, codeAt(RFC_SECRET, step - 1), now, null)).toBe(step - 1);
    expect(matchingStep(RFC_SECRET, codeAt(RFC_SECRET, step + 1), now, null)).toBe(step + 1);
    expect(matchingStep(RFC_SECRET, codeAt(RFC_SECRET, step + 2), now, null)).toBeNull();
    expect(matchingStep(RFC_SECRET, codeAt(RFC_SECRET, step), now, step)).toBeNull();
    expect(matchingStep(RFC_SECRET, 'abc123', now, null)).toBeNull();
  });
});
