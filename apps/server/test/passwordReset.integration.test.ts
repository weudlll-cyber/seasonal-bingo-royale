/**
 * @file   apps/server/test/passwordReset.integration.test.ts
 * @module server/test
 * @brief  "Forgot password?" in a standalone install (D60, 03 §1): one link, one hour, no reveal.
 *
 * Responsibility: a server in local mode with a mailer that keeps the messages. A request for
 *                 a known address sends one link and answers 202, for an unknown one sends
 *                 nothing with the same answer; the link sets a new password once (a weak one
 *                 refused), ends every session of the account and makes the other open links
 *                 invalid; the old password stops working, the new one signs in; requests per
 *                 e-mail are limited. Without SMTP settings and in website mode the routes do not
 *                 exist and the session says so. Its accounts are removed.
 * Depends on:     vitest, ../src/auth/accounts, ../src/auth/mailer (types), ./harness, ./websiteHelpers
 * Spec:           docs/spec/03-security-architecture.md §1, §13
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { deleteAccount, registerAccount } from '../src/auth/accounts.js';
import type { Mailer } from '../src/auth/mailer.js';
import type { App } from '../src/index.js';
import { buildOn, startHarness, stopHarness, SUITE_TIMEOUT_MS, type Harness } from './harness.js';
import { WEBSITE } from './websiteHelpers.js';

const sent: { to: string; text: string }[] = [];
const mailer: Mailer = {
  send: (to, _subject, text) => {
    sent.push({ to, text });
    return Promise.resolve();
  },
};

let harness: Harness;
let withMail: App;
const made: string[] = [];
const OLD = 'correct horse battery staple';
const NEW = 'a brand new long passphrase';

beforeAll(async () => {
  harness = await startHarness();
  withMail = await buildOn(harness.pool, harness.container.getConnectionUri(), {}, mailer);
}, SUITE_TIMEOUT_MS);
afterAll(async () => {
  for (const id of made) await deleteAccount(harness.pool, id);
  await withMail.fastify.close();
  await stopHarness(harness);
}, SUITE_TIMEOUT_MS);

const post = (app: App, url: string, payload: object, headers: Record<string, string> = {}) =>
  app.fastify.inject({ method: 'POST', url: `/api/v1${url}`, payload, headers });

async function account(name: string): Promise<string> {
  const r = await registerAccount(harness.pool, {
    email: `${name}@example.com`,
    displayName: name,
    password: OLD,
  });
  if (!r.ok) throw new Error('registration failed');
  made.push(r.id);
  return `${name}@example.com`;
}

const cookieOf = (r: { cookies: { name: string; value: string }[] }) => {
  const c = r.cookies.find((x) => x.name.endsWith('sbr_session'));
  return c === undefined ? '' : `${c.name}=${c.value}`;
};
const signedIn = async (app: App, cookie: string) =>
  (await app.fastify.inject({ url: '/api/v1/session', headers: { cookie } })).json<{
    signedIn: boolean;
    features: { passwordReset: boolean };
  }>();
const tokenIn = (text: string) => /token=([\w-]+)/.exec(text)?.[1] ?? '';

describe('password reset by e-mail (D60)', () => {
  it('sends one link to a known address, nothing to an unknown one, with the same answer', async () => {
    const email = await account('resetter');
    const known = await post(withMail, '/auth/password-reset', { email });
    const unknown = await post(withMail, '/auth/password-reset', { email: 'nobody@example.com' });
    expect([known.statusCode, unknown.statusCode]).toEqual([202, 202]);
    expect(known.body).toBe(unknown.body);
    expect(sent.filter((m) => m.to === email)).toHaveLength(1);
    expect(sent.filter((m) => m.to === 'nobody@example.com')).toHaveLength(0);
    expect(sent.at(-1)?.text).toMatch(/#\/reset-password\?token=[\w-]{40,}/);
  });

  it('sets the new password once, ends every session and voids the other links', async () => {
    const email = await account('forgetful');
    const before = cookieOf(await post(withMail, '/auth/login', { email, password: OLD }));
    expect((await signedIn(withMail, before)).signedIn).toBe(true);
    await post(withMail, '/auth/password-reset', { email });
    await post(withMail, '/auth/password-reset', { email });
    const [first, second] = sent.filter((m) => m.to === email).map((m) => tokenIn(m.text));
    const weak = await post(withMail, '/auth/password-reset/complete', {
      token: first,
      password: 'short',
    });
    expect(weak.json()).toMatchObject({ code: 'PASSWORD_WEAK' });
    const done = await post(withMail, '/auth/password-reset/complete', {
      token: first,
      password: NEW,
    });
    expect(done.statusCode).toBe(204);
    expect((await signedIn(withMail, before)).signedIn).toBe(false);
    for (const token of [first, second]) {
      const again = await post(withMail, '/auth/password-reset/complete', { token, password: NEW });
      expect(again.json()).toEqual({ code: 'RESET_INVALID' });
    }
    expect((await post(withMail, '/auth/login', { email, password: OLD })).statusCode).toBe(401);
    expect((await post(withMail, '/auth/login', { email, password: NEW })).statusCode).toBe(200);
  });

  it('limits the requests per e-mail address', async () => {
    const email = await account('hammering');
    const codes: number[] = [];
    for (let i = 0; i < 4; i += 1)
      codes.push((await post(withMail, '/auth/password-reset', { email })).statusCode);
    expect(codes).toEqual([202, 202, 202, 429]);
  });
});

describe('where password reset does not exist (D60)', () => {
  it('does not exist without SMTP settings or in website mode', async () => {
    const plain = harness.built;
    expect((await post(plain, '/auth/password-reset', { email: 'a@example.com' })).statusCode).toBe(
      404,
    );
    expect((await signedIn(plain, '')).features.passwordReset).toBe(false);
    expect((await signedIn(withMail, '')).features.passwordReset).toBe(true);
    const website = await buildOn(
      harness.pool,
      harness.container.getConnectionUri(),
      WEBSITE,
      mailer,
    );
    try {
      const r = await website.fastify.inject({
        method: 'POST',
        url: '/games/bingo/api/v1/auth/password-reset',
        payload: { email: 'a@example.com' },
      });
      expect(r.statusCode).toBe(404);
    } finally {
      await website.fastify.close();
    }
  });
});
