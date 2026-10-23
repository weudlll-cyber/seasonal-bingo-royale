/**
 * @file   apps/web/src/account/accountText.test.ts
 * @module web/account
 * @brief  The account forms' checks and messages: the spec's rules and plain answers.
 *
 * Responsibility: the register form refuses a display name outside 3–24 letters or digits,
 *                 a missing e-mail and a password under 12 characters before sending; every
 *                 server refusal (wrong login, name or e-mail in use, weak or common
 *                 password, too many tries) and an unknown code read as sentences, never as
 *                 a code.
 * Depends on:     vitest, ./accountText, ../shell/http
 * Spec:           docs/spec/03-security-architecture.md §2.1, §13; docs/spec/05-api-design.md §2.1
 */
import { describe, expect, it } from 'vitest';

import { ApiError } from '../shell/http.js';
import { accountError, registerProblem } from './accountText.js';

const ok = { displayName: 'anna_k', email: 'anna@example.com', password: 'correct horse battery' };

describe('register checks', () => {
  it('accepts a valid form and names the first problem otherwise', () => {
    expect(registerProblem(ok)).toBeNull();
    expect(registerProblem({ ...ok, displayName: 'an' })).toMatch(/3 to 24/);
    expect(registerProblem({ ...ok, displayName: 'anna k' })).toMatch(/no spaces/);
    expect(registerProblem({ ...ok, email: 'anna' })).toBe('Please enter an e-mail address.');
    expect(registerProblem({ ...ok, password: 'short' })).toBe(
      'The password needs at least 12 characters.',
    );
  });
});

describe('server refusals in plain words', () => {
  it.each([
    [new ApiError(401, 'LOGIN_FAILED'), 'Wrong e-mail or password.'],
    [new ApiError(429, 'RATE_LIMITED'), 'Too many tries. Please wait a minute and try again.'],
    [
      new ApiError(400, 'PASSWORD_WEAK', 'tooCommon'),
      'This password is too common. Please choose another.',
    ],
    [new ApiError(500, 'SOMETHING_NEW'), 'Something went wrong — please try again.'],
  ])('%s', (error, text) => {
    expect(accountError(error)).toBe(text);
  });

  it('gives one answer for a name or e-mail in use', () => {
    expect(accountError(new ApiError(409, 'REGISTRATION_FAILED'))).toMatch(/cannot be used/);
  });
});
