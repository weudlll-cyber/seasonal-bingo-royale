/**
 * @file   e2e/websiteLogin.spec.ts
 * @module e2e
 * @brief  Website mode end to end: sign in through the website, play, league points (D37).
 *
 * Responsibility: against a game server in website mode behind the stand-in proxy (./websiteStack):
 *                 "Sign in" on the leaderboard leads a visitor without a website session to the
 *                 website login and back, signed in under the website name (D43). Nine website
 *                 users play one short counting royale; the eight with a verified e-mail get league
 *                 points ("counted"), the one without does not ("notVerified"). Forged identity
 *                 headers sign nobody in: on another route, on the sign-in route without a session,
 *                 and sent directly without the proxy secret. The match finishes or is aborted;
 *                 accounts removed (DELETE /me by name, D42). Chromium only.
 * Depends on:     @playwright/test, ./websiteStack
 * Spec:           docs/spec/07-integration-architecture.md §2.3; docs/spec/01-game-design.md §10
 */
import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';

import { startWebsiteStack, type WebsiteStack } from './websiteStack.js';
import { FROM_THIS_SITE } from './fromThisSite.js';

const BASE = '/games/bingo';
const FORGED = {
  'x-acting-user-id': '9001',
  'x-acting-user': 'Web Player 01',
  'x-acting-user-roles': 'organiser',
  'x-acting-user-email-verified': 'true',
};
let stack: WebsiteStack;

test.beforeAll(async ({ browserName }) => {
  test.skip(browserName !== 'chromium', 'one browser is enough; it builds the client');
  test.setTimeout(4 * 60_000);
  stack = await startWebsiteStack();
  // 9001 may start games (9009 is unverified for the league below).
  for (let n = 1; n <= 9; n += 1) {
    const name = `Web Player ${String(n).padStart(2, '0')}`;
    stack.addMember({ id: 9000 + n, name, role: 'member', canHost: n === 1 });
  }
});

test.afterAll(async ({ browserName }) => {
  if (browserName !== 'chromium') return;
  await stack.removeAccounts();
  await stack.close();
});

// A website user signed in to the game (through the proxy), as an API client.
async function signedIn(id: number): Promise<APIRequestContext> {
  // The website's cookie in the context's jar, beside the game's own once it signs in.
  const { name, value } = stack.cookieOf(id);
  const cookie = { name, value, domain: '127.0.0.1', path: '/', expires: -1 };
  const ctx = await request.newContext({
    baseURL: stack.origin,
    storageState: {
      cookies: [{ ...cookie, httpOnly: false, secure: false, sameSite: 'Lax' as const }],
      origins: [],
    },
  });
  expect((await ctx.get(`${BASE}/auth/website`)).ok()).toBe(true);
  return ctx;
}

async function post(ctx: APIRequestContext, url: string, data: unknown) {
  const session = (await (await ctx.get(`${BASE}/api/v1/session`)).json()) as { csrfToken: string };
  return ctx.post(`${BASE}/api/v1${url}`, {
    data,
    headers: { ...FROM_THIS_SITE, 'x-csrf-token': session.csrfToken },
  });
}

// The browser player: "Sign in" on the leaderboard goes to the website's login, which signs
// in 9002 and sends back to the sign-in route and on to the leaderboard (D43).
async function browserSignIn(page: Page): Promise<void> {
  stack.signInAs(9002);
  await page.goto(`${stack.origin}${BASE}/#/leaderboard`);
  const login = page.waitForRequest((r) => new URL(r.url()).pathname === '/login');
  await page.getByTestId('sign-in').click();
  const back = new URL((await login).url()).searchParams.get('next') ?? '';
  expect(decodeURIComponent(back)).toBe(`${BASE}/auth/website?next=${BASE}/#/leaderboard`);
  await expect(page).toHaveURL(`${stack.origin}${BASE}/#/leaderboard`);
  await expect(page.getByTestId('signed-in-as')).toContainText('Web_Player_02 (player)');
  await expect(page.getByTestId('register')).toHaveCount(0);
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
  const host = await signedIn(9001);
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
    // A spec is a development tool: no preset needed (2026-11-21).
    devTools: true,
  });
  expect(created.status()).toBe(201);
  const { code } = (await created.json()) as { code: string };
  try {
    await page.goto(`${stack.origin}${BASE}/#/`);
    await page.getByTestId(`join-${code}`).click();
    await expect(page.getByTestId('waiting-room')).toBeVisible();
    const others = [host];
    for (let id = 9003; id <= 9009; id += 1) others.push(await signedIn(id));
    // The stand-in's members are all verified: this one's account loses it after signing in.
    stack.unverify(9009);
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
          // Under the 5 s the stand-in keeps an idle connection: a poll every 5 s reused one just
          // as it closed (ECONNRESET).
          intervals: [2_000],
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
  // To the website a visitor it knows nothing of is a guest: the app sends them to log in.
  expect(signIn.headers()['location']).toBe(
    `${BASE}/auth/website/login?next=${encodeURIComponent(`${BASE}/`)}`,
  );
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
