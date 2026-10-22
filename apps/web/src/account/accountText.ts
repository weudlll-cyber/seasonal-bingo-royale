/**
 * @file   apps/web/src/account/accountText.ts
 * @module web/account
 * @brief  The sign-in and register forms' checks and messages, in plain English.
 *
 * Responsibility: the spec's rules checked before sending (display name 3–24 letters,
 *                 digits, "_", "." or "-"; an e-mail address; a password of 12 to 128
 *                 characters — the server checks them again and also refuses common
 *                 passwords), and a sentence for every refusal the server gives: wrong
 *                 e-mail or password (one answer, so it never tells whether an account
 *                 exists), name or e-mail in use (one answer), weak password, too many tries,
 *                 e-mail not confirmed.
 * Depends on:     ../shell/http (types)
 * Used by:        ./SignIn, ./Register
 * Spec:           docs/spec/03-security-architecture.md §2.1, §13; docs/spec/05-api-design.md §2.1
 */
import { ApiError } from '../shell/http.js';

const NAME = /^[\p{L}\p{N}_.-]{3,24}$/u;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface RegisterValues {
  readonly displayName: string;
  readonly email: string;
  readonly password: string;
}

// What is wrong with the register form before it is sent, or null.
export function registerProblem(v: RegisterValues): string | null {
  if (!NAME.test(v.displayName.trim())) {
    return 'The display name needs 3 to 24 letters or digits (also _ . or -), no spaces.';
  }
  if (!EMAIL.test(v.email.trim())) return 'Please enter an e-mail address.';
  return passwordText(
    v.password.length < 12 ? 'tooShort' : v.password.length > 128 ? 'tooLong' : null,
  );
}

function passwordText(reason: string | null): string | null {
  if (reason === 'tooShort') return 'The password needs at least 12 characters.';
  if (reason === 'tooLong') return 'The password can have at most 128 characters.';
  if (reason === 'tooCommon') return 'This password is too common. Please choose another.';
  return null;
}

// The server's refusal as a sentence.
export function accountError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong — please try again.';
  const texts: Record<string, string> = {
    LOGIN_FAILED: 'Wrong e-mail or password.',
    REGISTRATION_FAILED:
      'This display name or e-mail cannot be used. Try another, or sign in if you already have an account.',
    RATE_LIMITED: 'Too many tries. Please wait a minute and try again.',
    EMAIL_NOT_VERIFIED: 'Please confirm your e-mail address first (see the mail we sent you).',
    VALIDATION_FAILED: 'Please check the form.',
  };
  if (error.code === 'PASSWORD_WEAK')
    return passwordText(error.reason) ?? 'Please choose a stronger password.';
  return texts[error.code] ?? 'Something went wrong — please try again.';
}
