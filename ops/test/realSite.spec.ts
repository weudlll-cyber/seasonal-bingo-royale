/**
 * @file   ops/test/realSite.spec.ts
 * @module ops/test
 * @brief  The game embedded in the real website, in a real browser (./real-site.sh), by phase.
 *
 * Responsibility: on https://example.org/games/bingo/ of a server the real website installer set
 *                 up: one test per phase, run one at a time between the website admin's steps
 *                 (`--grep "P<n> "`); /state/state.json and browser storage carry over. P1 guest
 *                 watches, joins through the website's login and "Register" (?next round trip),
 *                 opens the Chat room "bingo", plays but cannot host. P2 after "can start games":
 *                 session ends within one poll, the member starts a preset match listed in
 *                 open-rounds. P3 locked. P4 unlocked. P5 deleted: "deleted player" in results. P6
 *                 the website admin toggles maintenance; off at the end, also on failure.
 * Depends on:     @playwright/test
 * Spec:           docs/spec/07-integration-architecture.md §2, §6; docs/spec/12-testing-strategy.md §4;
 *                 docs/concepts/admin-area.md §3, §4 (Overview, History)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

// Mounted as /e2e/menu.ts in the browser container (./real-site-bingo.sh), so the path holds there.
import { openMenu } from '../../e2e/menu.js';

const STATE = '/state/state.json';
const GAME = '/games/bingo/';
// The website's account changes reach the game within one poll (2 minutes) and a margin.
const POLL_MS = 150_000;

interface State {
  watch: string;
  play: string;
  member: string;
  password: string;
  hosted?: string;
}

const state = (): State => JSON.parse(readFileSync(STATE, 'utf8')) as State;
const save = (s: State): void => {
  writeFileSync(STATE, JSON.stringify(s, null, 2));
};

// A browser context with the named storage kept in /state between phases.
async function contextOf(browser: Browser, name: string): Promise<BrowserContext> {
  const file = `/state/${name}.storage.json`;
  return browser.newContext(existsSync(file) ? { storageState: file } : {});
}
const keep = (context: BrowserContext, name: string) =>
  context.storageState({ path: `/state/${name}.storage.json` });

const sessionOf = async (page: Page) =>
  (await (await page.request.get(`${GAME}api/v1/session`)).json()) as {
    signedIn: boolean;
    permissions: string[];
    account: { displayName: string } | null;
    csrfToken: string;
  };

// A write to the game's API as the page's session (its CSRF token, the site's origin).
async function gamePost(page: Page, path: string, data: object) {
  const { csrfToken } = await sessionOf(page);
  return page.request.post(`${GAME}api/v1${path}`, {
    data,
    headers: { 'x-csrf-token': csrfToken, origin: new URL(page.url()).origin },
  });
}

// The website's login page (Username, Password, Log in) as a member types it.
async function websiteLogin(page: Page, name: string, password: string): Promise<void> {
  const main = page.getByRole('main');
  await main.getByLabel('Username').fill(name);
  await main.getByLabel('Password').fill(password);
  await main.getByRole('button', { name: 'Log in' }).click();
}

// "Sign in" in the game: the website's login when it asks (it may also send a member it knows
// straight back), then the game signed in.
async function signInAgain(page: Page, s: State): Promise<void> {
  await page.getByTestId('sign-in').click();
  const signedIn = page.getByTestId('signed-in-as');
  await expect(signedIn.or(page.getByRole('main').getByLabel('Username'))).toBeVisible({
    timeout: 30_000,
  });
  if (!(await signedIn.isVisible())) await websiteLogin(page, s.member, s.password);
  await expect(signedIn).toContainText(s.member, { timeout: 30_000 });
}

test('P1 guest, join through the website, chat, a member plays and cannot host', async ({
  browser,
}) => {
  const s = state();
  const guest = await (await contextOf(browser, 'guest')).newPage();
  await guest.goto(GAME);
  await expect(guest.getByTestId(`lobby-match-${s.watch}`)).toBeVisible();
  await guest.goto(`${GAME}#/match/${s.watch}`);
  await expect(guest.getByTestId('arena')).toBeVisible();
  await guest.goto(`${GAME}#/leaderboard`);
  await expect(guest.getByRole('heading', { name: /Leaderboard/ })).toBeVisible();
  // Join: to the website's login, "Register" there, back to the game signed in.
  const memberContext = await contextOf(browser, 'member');
  const member = await memberContext.newPage();
  await member.goto(GAME);
  await member.getByTestId(`sign-in-to-join-${s.play}`).click();
  await expect(member).toHaveURL(/\/login\?next=/);
  // The page's own link: the website's navigation shows a "Register" too once it has rendered.
  await member.getByRole('paragraph').getByRole('link', { name: 'Register' }).click();
  // The login page has a Username field too: fill only once the register form is there.
  await expect(member.getByRole('heading', { name: 'Register', level: 1 })).toBeVisible();
  await member.getByLabel('Username').fill(s.member);
  await member.getByLabel('Email').fill(`${s.member}@example.org`);
  await member.getByLabel('Password', { exact: true }).fill(s.password);
  await member.getByLabel('Repeat password').fill(s.password);
  await member.getByLabel(/at least 14 years old/).check();
  await member.getByRole('button', { name: 'Create account' }).click();
  const skip = member.getByRole('dialog', { name: 'Protect your private messages' });
  await skip
    .getByRole('button', { name: 'Skip' })
    .click({ timeout: 15_000 })
    .catch(() => undefined);
  await expect(member).toHaveURL(/\/games\/bingo\//, { timeout: 30_000 });
  await expect(member.getByTestId('signed-in-as')).toContainText(s.member);
  // The member plays (joins the lobby match) and cannot host.
  await member.goto(GAME);
  await member.getByTestId(`join-${s.play}`).click();
  await expect(member.getByTestId('waiting-room')).toBeVisible();
  await expect(member.getByRole('link', { name: 'Host a match' })).toHaveCount(0);
  expect((await sessionOf(member)).permissions).not.toContain('match.create');
  const refused = await gamePost(member, '/matches', {
    preset: 'royale-realtime',
    title: 'Not mine',
  });
  expect([refused.status(), ((await refused.json()) as { code: string }).code]).toEqual([
    403,
    'FORBIDDEN',
  ]);
  await chat(guest, member);
  await keep(memberContext, 'member');
});

// The website's room "bingo" in the dock under the game: the member writes, the guest reads; the
// theme follows.
async function chat(guest: Page, member: Page): Promise<void> {
  const text = `hello bingo ${String(Date.now() % 100_000)}`;
  for (const page of [guest, member]) {
    await page.goto(GAME);
    await expect(
      page.frameLocator('[data-testid="chat-frame"]').getByRole('region', { name: 'Chat: Bingo' }),
    ).toBeVisible();
  }
  const memberChat = member.frameLocator('[data-testid="chat-frame"]');
  await memberChat.getByLabel('Message', { exact: true }).fill(text);
  await memberChat.getByRole('button', { name: 'Send' }).click();
  const guestChat = guest.frameLocator('[data-testid="chat-frame"]');
  await expect(
    guestChat.getByRole('list', { name: 'Messages in Bingo' }).getByText(text),
  ).toBeVisible();
  for (const theme of ['dark', 'light']) {
    await guest.getByTestId('theme-toggle').click();
    await expect(guest.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(guestChat.locator('html')).toHaveAttribute('data-theme', theme);
  }
}

test('P2 the right to start games: the session ends, signed in again the member hosts', async ({
  browser,
}) => {
  const s = state();
  const context = await contextOf(browser, 'member');
  const member = await context.newPage();
  await member.goto(GAME);
  await expect
    .poll(async () => (await sessionOf(member)).signedIn, { timeout: POLL_MS, intervals: [5_000] })
    .toBe(false);
  await member.reload();
  await signInAgain(member, s);
  // Website mode at 1280 px: the organizer's bar folds too, Host a match sits in the menu.
  await openMenu(member);
  await member.getByRole('link', { name: 'Host a match' }).click();
  await expect(member.getByRole('heading', { name: 'Start a match' })).toBeVisible();
  await member.getByTestId('start-type-royale').click();
  await member.getByTestId('start-preset-royale-realtime').click();
  const title = `Website round ${String(Date.now() % 10_000)}`;
  await member.getByTestId('start-title').fill(title);
  await member.getByTestId('create-website').check();
  await member.getByTestId('create-submit').click();
  await expect(member.getByTestId('host-console')).toBeVisible();
  const code = (await member.getByTestId('host-code').innerText()).trim();
  const open = (await (await member.request.get(`${GAME}api/public/open-rounds`)).json()) as {
    rounds: { title: string }[];
  };
  expect(open.rounds.map((r) => r.title)).toContain(title);
  save({ ...s, hosted: code });
  await keep(context, 'member');
});

test('P3 locked on the website: the session ends and the member stays a guest', async ({
  browser,
}) => {
  const context = await contextOf(browser, 'member');
  const member = await context.newPage();
  await member.goto(GAME);
  await expect
    .poll(async () => (await sessionOf(member)).signedIn, { timeout: POLL_MS, intervals: [5_000] })
    .toBe(false);
  await member.reload();
  await member.getByTestId('sign-in').click();
  // The website has ended the locked member's session too: its login page, not the game.
  await expect(member).toHaveURL(/\/login\?next=/);
  await member.goto(GAME);
  expect((await sessionOf(member)).signedIn).toBe(false);
  await keep(context, 'member');
});

test('P4 unlocked: the member signs in again', async ({ browser }) => {
  const s = state();
  const context = await contextOf(browser, 'member');
  const member = await context.newPage();
  await member.goto(GAME);
  await signInAgain(member, s);
  await keep(context, 'member');
});

test('P5 deleted on the website: a deleted player in past results, gone from the board', async ({
  browser,
}) => {
  const s = state();
  const page = await (await contextOf(browser, 'guest')).newPage();
  await page.goto(`${GAME}#/match/${s.play}`);
  await expect
    .poll(
      async () => {
        // A reload: a goto to the same address with a #fragment would not load the page again.
        await page.reload();
        await page.getByText('Final placement').waitFor();
        return page.getByText(/deleted player/).count();
      },
      { timeout: POLL_MS, intervals: [10_000] },
    )
    .toBeGreaterThan(0);
  await expect(page.getByText(s.member)).toHaveCount(0);
  const board = (await (await page.request.get(`${GAME}api/v1/leaderboards`)).text()).toLowerCase();
  expect(board).not.toContain(s.member.toLowerCase());
  await page.goto(`/login?next=${encodeURIComponent(GAME)}`);
  await websiteLogin(page, s.member, s.password);
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test('P6 the website admin: the Overview, maintenance on and off, both in the History', async ({
  browser,
}) => {
  const admin = await (await contextOf(browser, 'admin')).newPage();
  await admin.goto(GAME);
  const reason = `Rehearsal ${String(Date.now() % 100_000)}`;
  try {
    // Website mode at 1280 px: the back link folds the bar, Admin sits in the menu. The bar
    // folds once the account is in it, so the menu is opened after the chip is there.
    await expect(admin.getByTestId('signed-in-as')).toBeAttached();
    await openMenu(admin);
    await admin.getByRole('link', { name: 'Admin', exact: true }).click();
    await expect(admin.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await expect(admin.getByTestId('admin-maintenance-state')).toHaveText('Maintenance is off');
    await admin.getByTestId('admin-maintenance-reason').fill(reason);
    await admin.getByTestId('admin-maintenance-toggle').click();
    await expect(admin.getByTestId('admin-maintenance-state')).toHaveText(
      `Maintenance is on: ${reason}`,
    );
    await admin.getByTestId('admin-maintenance-toggle').click();
    await expect(admin.getByTestId('admin-maintenance-state')).toHaveText('Maintenance is off');
    await admin.getByRole('link', { name: 'History', exact: true }).click();
    const changes = admin.locator('[data-testid^="admin-history-"]');
    // Newest first: the switch off above the switch on with its reason.
    await expect(changes.first()).toContainText('Maintenance off');
    await expect(changes.filter({ hasText: `Maintenance on: ${reason}` })).toHaveCount(1);
  } finally {
    await gamePost(admin, '/admin/maintenance', { on: false });
  }
});
