/**
 * @file   packages/contracts/src/config/technical.ts
 * @module contracts/config
 * @brief  The Technical section: session lengths, sign-in and reset limits, socket caps.
 *
 * Responsibility: the `technical` settings document (admin-area §4 "Technical", §8 (c), (e),
 *                 (p)): how long player and admin sessions last (idle and at most), how long a
 *                 password reset link is valid, the application rate limits per window (sign-in
 *                 per account and address and per address, registration, the API, guest
 *                 sessions, reset requests, second-step codes; the windows stay fixed) and the
 *                 socket caps per address and per session; their hard bounds (admin-values.md
 *                 part C, proposal min and max), names, what each does with a warning on every
 *                 value, today's defaults and `technicalSettingsOf`, the stored document over the
 *                 defaults the server gives (the socket caps' first default is the environment).
 * Depends on:     zod, ./presetCatalogue (types)
 * Used by:        ../index; apps/server (sessions, rate limits, sockets, admin Technical)
 * Spec:           docs/concepts/admin-area.md §4, §8 (c), (e), (p), §9 piece 7
 */
import { z } from 'zod';

import type { Entry } from './presetCatalogue.js';

const whole = (min: number, max: number) => z.number().int().min(min).max(max);

export const TechnicalSettingsSchema = z.strictObject({
  playerIdleDays: whole(1, 30),
  playerAbsoluteDays: whole(1, 365),
  adminIdleMinutes: whole(5, 240),
  adminAbsoluteHours: whole(1, 24),
  resetLinkMinutes: whole(10, 1_440),
  loginAccountIp: whole(3, 50),
  loginIp: whole(5, 500),
  register: whole(1, 500),
  api: whole(30, 1_200),
  guest: whole(1, 500),
  resetIp: whole(1, 100),
  resetAccount: whole(1, 20),
  twoFactor: whole(3, 20),
  socketsPerAddress: whole(1, 10_000),
  socketsPerSession: whole(1, 20),
});
export type TechnicalSettings = z.infer<typeof TechnicalSettingsSchema>;

export const TECHNICAL_DEFAULTS: TechnicalSettings = {
  playerIdleDays: 7,
  playerAbsoluteDays: 30,
  adminIdleMinutes: 30,
  adminAbsoluteHours: 8,
  resetLinkMinutes: 60,
  loginAccountIp: 5,
  loginIp: 20,
  register: 5,
  api: 120,
  guest: 10,
  resetIp: 10,
  resetAccount: 3,
  twoFactor: 5,
  socketsPerAddress: 50,
  socketsPerSession: 5,
};

// The stored document over `defaults` (the server's: the environment's socket caps).
export function technicalSettingsOf(
  document: Readonly<Record<string, unknown>>,
  defaults: TechnicalSettings = TECHNICAL_DEFAULTS,
): TechnicalSettings {
  const p = TechnicalSettingsSchema.safeParse({ ...defaults, ...document });
  return p.success ? p.data : defaults;
}

const NOW = ' Applies at once, without a restart.';
const SESSION =
  'Shorter times sign people out sooner; longer ones leave a lost device signed in longer.';
const LIMIT = 'Too low locks out honest players; too high lets attacks through.';

const entry = (label: string, description: string, unit: string, warning: string): Entry => ({
  label,
  description: `${description}${NOW}`,
  unit,
  warning,
});

export const TECHNICAL_CATALOGUE: Readonly<Record<keyof TechnicalSettings, Entry>> = {
  playerIdleDays: entry(
    'Player session, idle',
    'A player is signed out after this long without a visit (standalone).',
    'days',
    SESSION,
  ),
  playerAbsoluteDays: entry(
    'Player session, at most',
    'A player signs in again after this long however active (standalone; the website sets its own).',
    'days',
    SESSION,
  ),
  adminIdleMinutes: entry(
    'Admin session, idle',
    'An admin is signed out after this long without a request.',
    'minutes',
    SESSION,
  ),
  adminAbsoluteHours: entry(
    'Admin session, at most',
    'An admin signs in again after this long however active.',
    'hours',
    SESSION,
  ),
  resetLinkMinutes: entry(
    'Password reset link valid for',
    'How long the link in a password reset e-mail works.',
    'minutes',
    'A long time gives a stolen mailbox more time.',
  ),
  loginAccountIp: entry(
    'Sign-in tries per account and address',
    'Wrong passwords allowed for one account from one address in 15 minutes.',
    'tries',
    LIMIT,
  ),
  loginIp: entry(
    'Sign-in tries per address',
    'Sign-in tries allowed from one address in 15 minutes.',
    'tries',
    LIMIT,
  ),
  register: entry(
    'New accounts per address',
    'Accounts one address may register in an hour.',
    'accounts',
    LIMIT,
  ),
  api: entry(
    'Requests per session',
    'Requests one signed-in session may make in a minute.',
    'requests',
    LIMIT,
  ),
  guest: entry(
    'Guest sessions per address',
    'Guest sessions one address may start in an hour.',
    'sessions',
    LIMIT,
  ),
  resetIp: entry(
    'Reset requests per address',
    'Password reset requests from one address in an hour.',
    'requests',
    LIMIT,
  ),
  resetAccount: entry(
    'Reset requests per e-mail',
    'Password reset requests for one e-mail address in an hour.',
    'requests',
    LIMIT,
  ),
  twoFactor: entry(
    'Second-step codes per session',
    'Codes one sign-in may try in 15 minutes.',
    'codes',
    LIMIT,
  ),
  socketsPerAddress: entry(
    'Live connections per address',
    'Open live connections from one address (a school or a café shares one).',
    'connections',
    'Too low stops players behind one address; too high lets one address tie up the server.',
  ),
  socketsPerSession: entry(
    'Live connections per session',
    'Open live connections of one signed-in session (tabs).',
    'connections',
    LIMIT,
  ),
};
