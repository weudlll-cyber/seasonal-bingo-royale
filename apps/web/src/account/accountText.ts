/**
 * @file   apps/web/src/account/accountText.ts
 * @module web/account
 * @brief  The sign-in and register forms' checks and messages, in plain English.
 *
 * Responsibility: the spec's rules checked before sending (a display name of letters,
 *                 digits, "_", "." or "-"; an e-mail address; a password — both lengths
 *                 from the server's limits, admin-area §8 (m); the server checks them again
 *                 and also refuses common passwords), and a sentence for every refusal the
 *                 server gives: wrong
 *                 e-mail or password (one answer, so it never tells whether an account
 *                 exists), name or e-mail in use (one answer), weak password, too many tries,
 *                 e-mail not confirmed.
 * Depends on:     @sbr/contracts (types), ../shell/http (types)
 * Used by:        ./Register, ./formParts, ./PasswordReset
 * Spec:           docs/spec/03-security-architecture.md §2.1, §13; docs/spec/05-api-design.md §2.1
 */
import type { ClientLimits } from '@sbr/contracts';

import { ApiError } from '../shell/http.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface RegisterValues {
  readonly displayName: string;
  readonly email: string;
  readonly password: string;
}

// What is wrong with the register form before it is sent, or null; `limits` are the server's.
export function registerProblem(v: RegisterValues, limits: ClientLimits): string | null {
  // Letters, digits and `_ . -`, in the server's lengths (the session's limits).
  const { min, max } = limits.displayName;
  const name = new RegExp(`^[\\p{L}\\p{N}_.-]{${String(min)},${String(max)}}$`, 'u');
  if (!name.test(v.displayName.trim())) {
    return `The display name needs ${nameRange(limits)} letters or digits (also _ . or -), no spaces.`;
  }
  if (!EMAIL.test(v.email.trim())) return 'Please enter an e-mail address.';
  const { min: least, max: most } = limits.password;
  const length = v.password.length;
  return passwordText(length < least ? 'tooShort' : length > most ? 'tooLong' : null, limits);
}

// "3 to 24": the display name's lengths as the server sends them.
export const nameRange = (limits: ClientLimits): string =>
  `${String(limits.displayName.min)} to ${String(limits.displayName.max)}`;

function passwordText(reason: string | null, limits: ClientLimits | null): string | null {
  const { min, max } = limits?.password ?? { min: null, max: null };
  if (reason === 'tooShort')
    return min === null
      ? 'The password is too short.'
      : `The password needs at least ${String(min)} characters.`;
  if (reason === 'tooLong')
    return max === null
      ? 'The password is too long.'
      : `The password can have at most ${String(max)} characters.`;
  if (reason === 'tooCommon') return 'This password is too common. Please choose another.';
  return null;
}

// The server's refusal as a sentence; `limits` (the server's) name the password lengths.
export function accountError(error: unknown, limits: ClientLimits | null = null): string {
  if (!(error instanceof ApiError)) return 'Something went wrong — please try again.';
  const texts: Record<string, string> = {
    LOGIN_FAILED: 'Wrong e-mail or password.',
    REGISTRATION_FAILED:
      'This display name or e-mail cannot be used. Try another, or sign in if you already have an account.',
    RATE_LIMITED: 'Too many tries. Please wait a minute and try again.',
    EMAIL_NOT_VERIFIED: 'Please confirm your e-mail address first (see the mail we sent you).',
    VALIDATION_FAILED: 'Please check the form.',
    RESET_INVALID: 'This link was used already or has expired. Ask for a new one.',
  };
  if (error.code === 'PASSWORD_WEAK')
    return passwordText(error.reason, limits) ?? 'Please choose a stronger password.';
  return texts[error.code] ?? 'Something went wrong — please try again.';
}
