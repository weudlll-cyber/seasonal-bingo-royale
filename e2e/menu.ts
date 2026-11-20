/**
 * @file   e2e/menu.ts
 * @module e2e
 * @brief  Opens the top bar's menu where it is folded (below 960 px), before a bar item is used.
 *
 * Responsibility: on a phone or tablet the navigation and the account items sit behind one
 *                 "Menu" button (apps/web/src/shell/MenuFold); a spec that clicks or expects
 *                 one of them opens the menu first. On a desktop the button is hidden and this
 *                 does nothing. The menu closes by itself on a new route or another sign-in.
 * Depends on:     @playwright/test
 * Used by:        ./realGame, ./account.spec, ./leaderboard.spec, ./passwordReset.spec
 * Spec:           docs/concepts/fit-audit.md §5 item 7
 */
import type { Page } from '@playwright/test';

export async function openMenu(page: Page): Promise<void> {
  const button = page.getByTestId('menu-button');
  if (!(await button.isVisible())) return;
  if ((await button.getAttribute('aria-expanded')) === 'true') return;
  await button.click();
}
