/**
 * @file   apps/server/src/config/env.test.ts
 * @module server/config
 * @brief  Fail closed: production by default, development features only with SBR_DEV=1 on localhost.
 *
 * Responsibility: without NODE_ENV and SBR_DEV the settings say production and no
 *                 development features; SBR_DEV=1 is refused for a public address and
 *                 accepted for localhost; the seed key is required unless SBR_DEV=1 or tests;
 *                 the sign-in mode is local unless set, website mode needs its settings (D37).
 * Depends on:     ./env, ./seedKey
 * Spec:           docs/spec/03-security-architecture.md §3; docs/spec/09-deployment-architecture.md §1
 */
import { describe, expect, it } from 'vitest';

import { loadEnv } from './env.js';
import { seedKeyFrom } from './seedKey.js';

const DB = { DATABASE_URL: 'postgres://u:p@localhost:5432/db' };

describe('the settings (audit S1)', () => {
  it('run as production without development features by default', () => {
    const env = loadEnv(DB);
    expect([env.NODE_ENV, env.SBR_DEV]).toEqual(['production', false]);
    expect(() => seedKeyFrom(env)).toThrow(/SBR_SEED_KEY is required/);
  });

  it('refuse SBR_DEV=1 for a public address and accept it on localhost', () => {
    expect(() =>
      loadEnv({ ...DB, SBR_DEV: '1', SBR_PUBLIC_URL: 'https://bingo.example.org/' }),
    ).toThrow(/SBR_DEV=1 is refused for the public address bingo.example.org/);
    const local = loadEnv({ ...DB, SBR_DEV: '1', SBR_PUBLIC_URL: 'http://localhost:5390/' });
    expect(local.SBR_DEV).toBe(true);
    expect(seedKeyFrom(local)).toHaveLength(32);
  });
});

describe('the sign-in mode (D37)', () => {
  it('is local by default; website mode needs the public address, proxies and secret', () => {
    expect(loadEnv(DB).SBR_AUTH_MODE).toBe('local');
    expect(() => loadEnv({ ...DB, SBR_AUTH_MODE: 'website' })).toThrow(/needs SBR_PUBLIC_URL/);
    const settings = {
      ...DB,
      SBR_AUTH_MODE: 'website',
      SBR_PUBLIC_URL: 'https://example.org/games/bingo/',
      SBR_TRUSTED_PROXIES: '172.18.0.0/16',
      SBR_WEBSITE_HEADER_ID: 'X-Site-User-Id',
    };
    expect(() => loadEnv(settings)).toThrow(/SBR_WEBSITE_PROXY_SECRET/);
    const site = loadEnv({ ...settings, SBR_WEBSITE_PROXY_SECRET: 'ab'.repeat(32) });
    expect(site.SBR_WEBSITE_HEADER_ID).toBe('x-site-user-id');
    expect(site.SBR_WEBSITE_HEADER_NAME).toBe('x-acting-user');
    expect(site.SBR_WEBSITE_LOGIN_PATH).toBe('/login?next=');
  });

  it('takes the website login only as a path on the website (D43)', () => {
    const login = (path: string) => () => loadEnv({ ...DB, SBR_WEBSITE_LOGIN_PATH: path });
    expect(login('/signin?return=')().SBR_WEBSITE_LOGIN_PATH).toBe('/signin?return=');
    for (const bad of ['https://evil.example/login?next=', '//evil.example/', '/\\evil', 'login'])
      expect(login(bad)).toThrow(/SBR_WEBSITE_LOGIN_PATH/);
  });
});
