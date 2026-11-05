/**
 * @file   e2e/websiteLogin.spec.ts
 * @module e2e
 * @brief  Website mode end to end: sign in through the website, play, league points (D37).
 *
 * Responsibility: against a game server in website mode behind a stand-in of the website's
 *                 proxy (./websiteStack): in the browser, "Sign in" on the leaderboard leads a
 *                 visitor without a website session to the website's login and, once signed in
 *                 there, back to the leaderboard, signed in under the website name (D43). Nine
 *                 website users (one in the browser, the
 *                 organiser hosting) play one short counting royale; the eight with a verified
 *                 e-mail get league points ("counted"), the one without does not ("notVerified").
 *                 Forged identity headers sign nobody in, on another route, on the sign-in
 *                 route without a website session, and sent to the app directly from this
 *                 machine without the proxy secret. The match finishes (or is aborted); the
 *                 website users' accounts are removed (DELETE /me by name, D42). Chromium only
 *                 (it builds the client).
 * Depends on:     @playwright/test, ./websiteStack
 * Spec:           docs/spec/07-integration-architecture.md §2.3; docs/spec/01-game-design.md §10
 */
import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';

import { startWebsiteStack, type StubUser, type WebsiteStack } from './websiteStack.js';

const BASE = '/games/bingo';
const FORGED = {
  'x-acting-user-id': 'w-01',
  'x-acting-user': 'Web Player 01',
  'x-acting-user-roles': 'organiser',
  'x-acting-user-email-verified': 'true',
};
let stack: WebsiteStack;

test.beforeAll(async ({ browserName }) => {
  test.skip(browserName !== 'chromium', 'one browser is enough; it builds the client');
  test.setTimeout(4 * 60_000);
  stack = await startWebsiteStack();
  // w-01 may start games; w-09 has no verified e-mail address.
  for (let n = 1; n <= 9; n += 1) {
    const id = `w-${String(n).padStart(2, '0')}`;
    const user: StubUser = {
      id,
      name: `Web Player ${String(n).padStart(2, '0')}`,
      roles: 'member',
      verified: n !== 9,
      canHost: n === 1,
    };
    stack.users.set(id, user);
  }
});

test.afterAll(async ({ browserName }) => {
  if (browserName !== 'chromium') return;
  await stack.removeAccounts();
  await stack.close();
});

// A website user signed in to the game (through the proxy), as an API client.
async function signedIn(id: string): Promise<APIRequestContext> {
  const ctx = await request.newContext({
    baseURL: stack.origin,
    storageState: {
      cookies: [{ name: 'stub_user', value: id, domain: '127.0.0.1', path: '/', expires: -1 }].map(
        (c) => ({ ...c, httpOnly: false, secure: false, sameSite: 'Lax' as const }),
      ),
      origins: [],
    },
  });
  expect((await ctx.get(`${BASE}/auth/website`)).ok()).toBe(true);
  return ctx;
}

async function post(ctx: APIRequestContext, url: string, data: unknown) {
  const session = (await (await ctx.get(`${BASE}/api/v1/session`)).json()) as { csrfToken: string };
  return ctx.post(`${BASE}/api/v1${url}`, { data, headers: { 'x-csrf-token': session.csrfToken } });
}

// The browser player: "Sign in" on the leaderboard goes to the website's login first; signed
// in there as w-02, the login sends back to the sign-in route and on to the leaderboard (D43).
async function browserSignIn(page: Page): Promise<void> {
  await page.goto(`${stack.origin}${BASE}/#/leaderboard`);
  await page.getByTestId('open-sign-in').click();
  await expect(page.locator('body')).toHaveText('website login');
  const back = new URL(page.url()).searchParams.get('next') ?? '';
  expect(decodeURIComponent(back)).toBe(`${BASE}/auth/website?next=${BASE}/#/leaderboard`);
  await page.context().addCookies([{ name: 'stub_user', value: 'w-02', url: stack.origin }]);
  await page.reload();
  await expect(page).toHaveURL(`${stack.origin}${BASE}/#/leaderboard`);
  await expect(page.getByTestId('signed-in-as')).toContainText('Web_Player_02 (player)');
  await expect(page.getByTestId('open-register')).toHaveCount(0);
}

const leagueOf = async (ctx: APIRequestContext, name: string) => {
  const r = await ctx.get(`${BASE}/api/v1/players/${name}`);
  const profile = (await r.json()) as { recentMatches: { league: string }[] };
  return profile.recentMatches[0]?.league;
};

test('website users sign in through the website and get league points when verified', async ({
  page,
}) => {
  test.setTimeout(8 * 60_000);
  await browserSignIn(page);
  const host = await signedIn('w-01');
  const created = await post(host, '/matches', {
    title: 'Website league',
    gameType: 'royale',
    drawMode: 'auto',
    drawIntervalMs: 4_000,
    missedNumbers: { kind: 'autoMarkAfter', delayMs: 3_000 },
    countsForLeaderboard: true,
    maxPlayers: 9,
    roundPause: { kind: 'wait', ms: 3_000 },
    testProfile: 'fast',
  });
  expect(created.status()).toBe(201);
  const { code } = (await created.json()) as { code: string };
  try {
    await page.goto(`${stack.origin}${BASE}/#/`);
    await page.getByTestId(`join-${code}`).click();
    await expect(page.getByTestId('waiting-room')).toBeVisible();
    const others = [host];
    for (const id of ['w-03', 'w-04', 'w-05', 'w-06', 'w-07', 'w-08', 'w-09'])
      others.push(await signedIn(id));
    for (const ctx of others)
      expect((await post(ctx, `/matches/${code}/join`, {})).ok()).toBe(true);
    expect((await post(host, `/matches/${code}/start`, {})).ok()).toBe(true);
    await expect
      .poll(
        async () =>
          ((await (await host.get(`${BASE}/api/v1/matches/${code}`)).json()) as { status: string })
            .status,
        {
          timeout: 6 * 60_000,
          intervals: [5_000],
        },
      )
      .toBe('finished');
    expect(await leagueOf(host, 'Web_Player_02')).toBe('counted');
    expect(await leagueOf(host, 'Web_Player_09')).toBe('notVerified');
  } finally {
    const status = (
      (await (await host.get(`${BASE}/api/v1/matches/${code}`)).json()) as { status: string }
    ).status;
    if (status === 'lobby' || status === 'running') {
      await post(host, `/matches/${code}/abort`, { reason: 'test cleanup' });
    }
  }
});

test('forged identity headers sign nobody in', async () => {
  const ctx = await request.newContext({ baseURL: stack.origin, extraHTTPHeaders: FORGED });
  const session = (await (await ctx.get(`${BASE}/api/v1/session`)).json()) as { signedIn: boolean };
  expect(session.signedIn).toBe(false);
  const signIn = await ctx.get(`${BASE}/auth/website`, { maxRedirects: 0 });
  expect(signIn.status()).toBe(302);
  expect(signIn.headers()['location']).toBe(`${BASE}/auth/website/login`);
  expect(signIn.headers()['set-cookie']).toBeUndefined();
  await ctx.dispose();
});

test('forged identity headers sent to the app directly sign nobody in without the secret', async () => {
  // This machine's address is the trusted proxy's: only the proxy secret tells them apart.
  const ctx = await request.newContext({ baseURL: stack.appOrigin, extraHTTPHeaders: FORGED });
  const signIn = await ctx.get(`${BASE}/auth/website`, { maxRedirects: 0 });
  expect(signIn.status()).toBe(403);
  expect(signIn.headers()['set-cookie']).toBeUndefined();
  await ctx.dispose();
});
