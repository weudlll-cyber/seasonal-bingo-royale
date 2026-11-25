/**
 * @file   apps/server/src/http/routes/loginBrake.test.ts
 * @module server/http
 * @brief  Password sign-in is braked by wrong passwords only (K46, 03 §13).
 *
 * Responsibility: through POST /api/v1/auth/login with the accounts and the password check
 *                 stubbed: correct sign-ins are never braked, however many; the limit of an
 *                 account and address is reached by wrong passwords only, and a braked key is
 *                 refused before its password is checked; guesses sent at the same time are held
 *                 back too.
 * Depends on:     vitest, fastify, @fastify/cookie, @sbr/contracts, ./auth
 * Spec:           docs/spec/03-security-architecture.md §13
 */
import cookie from '@fastify/cookie';
import { TECHNICAL_DEFAULTS } from '@sbr/contracts';
import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { registerAuthRoutes } from './auth.js';

const checked = vi.hoisted(() => ({ passwords: 0 }));

vi.mock('../../auth/accounts.js', () => ({
  findLoginAccount: () => Promise.resolve({ id: 'a1', passwordHash: 'x', emailVerified: true }),
  recordLogin: () => Promise.resolve(),
  deleteAccount: () => Promise.resolve(),
  passwordHashOf: () => Promise.resolve('x'),
  registerAccount: () => Promise.resolve({ ok: false }),
}));
vi.mock('../../auth/password.js', () => ({
  dummyPasswordHash: () => Promise.resolve('x'),
  passwordProblem: () => null,
  verifyPassword: async (_hash: string, password: string) => {
    checked.passwords += 1;
    // Slow like a real hash, so guesses sent together overlap.
    await new Promise((resolve) => setTimeout(resolve, 5));
    return password === 'right';
  },
}));
vi.mock('../../auth/sessions.js', () => ({
  createSession: () => Promise.resolve({ token: 't', csrfToken: 'c' }),
  revokeSession: () => Promise.resolve(),
  accountSessionIds: () => Promise.resolve([]),
  WEBSITE_SESSION_DAYS: 7,
}));

async function server(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(cookie);
  app.decorateRequest('session', null);
  registerAuthRoutes(app, {
    pool: {} as never,
    cookie: { name: 'sbr_session', secure: false, path: '/' },
    features: () => ({ guests: false, emailVerification: false }) as never,
    screens: () => ({}) as never,
    technical: () => TECHNICAL_DEFAULTS,
    sessionEnds: { end: () => Promise.resolve() } as never,
    mode: 'local',
    basePath: '/',
  });
  return app;
}

const signIn = async (app: FastifyInstance, password: string, email = 'a@b.cd') =>
  (await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } }))
    .statusCode;

const LIMIT = TECHNICAL_DEFAULTS.loginAccountIp;

describe('the sign-in brake', () => {
  beforeEach(() => {
    checked.passwords = 0;
  });

  it('never brakes a correct sign-in', async () => {
    const app = await server();
    const codes = [];
    for (let i = 0; i < TECHNICAL_DEFAULTS.loginIp + 5; i += 1)
      codes.push(await signIn(app, 'right'));
    expect(new Set(codes)).toEqual(new Set([200]));
  });

  it('counts wrong passwords only, and refuses a braked key before checking', async () => {
    const app = await server();
    for (let i = 0; i < LIMIT - 1; i += 1) expect(await signIn(app, 'wrong')).toBe(401);
    // Correct sign-ins in between count nothing.
    for (let i = 0; i < LIMIT; i += 1) expect(await signIn(app, 'right')).toBe(200);
    expect(await signIn(app, 'wrong')).toBe(401);
    const before = checked.passwords;
    expect(await signIn(app, 'wrong')).toBe(429);
    expect(await signIn(app, 'right')).toBe(429);
    expect(checked.passwords).toBe(before);
    // Another account from the same address is its own key.
    expect(await signIn(app, 'right', 'z@b.cd')).toBe(200);
  });

  it('holds back guesses sent at the same time', async () => {
    const app = await server();
    const codes = await Promise.all(Array.from({ length: 40 }, () => signIn(app, 'wrong')));
    expect(codes.filter((c) => c === 401).length).toBeLessThan(2 * LIMIT);
    expect(checked.passwords).toBeLessThan(2 * LIMIT);
    expect(codes.filter((c) => c === 429).length).toBeGreaterThan(0);
  });
});
