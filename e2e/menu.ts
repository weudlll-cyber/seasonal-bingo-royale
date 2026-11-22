/**
 * @file   e2e/menu.ts
 * @module e2e
 * @brief  Opens the top bar's menu where it is folded, before a bar item is used.
 *
 * Responsibility: when the bar's items do not fit on one row (always below 960 px) the
 *                 navigation and the account items sit behind one "Menu" button
 *                 (apps/web/src/shell/MenuFold); a spec that clicks or expects one of them
 *                 opens the menu first, after a pending fold decision has landed. Unfolded the
 *                 button is hidden and this does nothing. The menu closes by itself on a new route or another sign-in.
 * Depends on:     @playwright/test
 * Used by:        ./realGame, ./account.spec, ./leaderboard.spec, ./passwordReset.spec,
 *                 ./chatEmbed.spec, ./hostNav.spec, ops/test/realSite.spec (mounted read-only in the
 *                 rehearsal's browser container as /e2e/menu.ts)
 * Spec:           docs/concepts/fit-audit.md §5 item 7
 */
import type { Page } from '@playwright/test';

export async function openMenu(page: Page): Promise<void> {
  // The bar decides to fold on resize: let a pending decision land (two frames) first, so a
  // button about to disappear is never clicked (CI run 44961351486).
  await page.evaluate(
    () =>
      new Promise<void>((done) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            done();
          });
        });
      }),
  );
  const button = page.getByTestId('menu-button');
  if (!(await button.isVisible())) return;
  if ((await button.getAttribute('aria-expanded')) === 'true') return;
  await button.click();
}
