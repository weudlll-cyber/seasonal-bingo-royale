/**
 * @file   e2e/acceptance/websiteSweep.ts
 * @module e2e/acceptance
 * @brief  The website-mode screens of the fit audit: a member signed in, posts, one screen looked at.
 *
 * Responsibility: sign a stand-in member (../websiteStack) in through its proxy, post under the
 *                 game's base with the CSRF token, and hand a screen to the kit's sweep
 *                 (./kitSweep) under its website-mode name.
 * Depends on:     @playwright/test, ../fromThisSite, ../websiteStack (types), ./kitSweep
 * Used by:        ./fitAudit.spec
 * Spec:           docs/concepts/fit-audit.md §7; docs/spec/01-game-design.md §13
 */
import { expect, type APIResponse, type Page } from '@playwright/test';

import type { WebsiteStack } from '../websiteStack.js';
import { kitLooks } from './kitSweep.js';
import { FROM_THIS_SITE } from '../fromThisSite.js';

export const BASE = '/games/bingo';

// A member of the stand-in website, signed in through its proxy; lands on the lobby.
export async function signInMember(page: Page, stack: WebsiteStack, id: number): Promise<void> {
  const name = stack.memberName(id);
  await page.context().addCookies([stack.cookieOf(id)]);
  await page.goto(`${stack.origin}${BASE}/auth/website?next=${BASE}/%23/`);
  await expect(page.getByTestId('signed-in-as')).toContainText(name, { timeout: 30_000 });
}

// The page's POST under the game's base with its CSRF token (a new match says it comes from
// a development tool, as ../realGame post does).
export async function webPost(
  page: Page,
  stack: WebsiteStack,
  url: string,
  data: Record<string, unknown>,
): Promise<APIResponse> {
  const session = (await (
    await page.request.get(`${stack.origin}${BASE}/api/v1/session`)
  ).json()) as {
    csrfToken: string;
  };
  const body = url === '/matches' ? { ...data, devTools: true } : data;
  return page.request.post(`${stack.origin}${BASE}/api/v1${url}`, {
    data: body,
    headers: { ...FROM_THIS_SITE, 'x-csrf-token': session.csrfToken },
  });
}

// One screen of the game inside the website.
export const sweep = (page: Page, screen: string) => kitLooks(page, `website-${screen}`);
