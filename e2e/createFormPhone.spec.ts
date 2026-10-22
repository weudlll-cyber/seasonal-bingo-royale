/**
 * @file   e2e/createFormPhone.spec.ts
 * @module e2e
 * @brief  On a 390 px phone every option of the create form's dropdowns is fully readable.
 *
 * Responsibility: with every dropdown of the create form showing ("At a set time" chosen,
 *                 royale, so the pause choice shows too), each option's text, measured in
 *                 the dropdown's own font, fits the room inside the closed dropdown (its
 *                 width less padding and 24 px for the arrow). Nothing is cut off.
 * Depends on:     @playwright/test, ./realGame, ./screens
 * Spec:           docs/spec/01-game-design.md §13
 */
import { expect, test } from '@playwright/test';

import { signIn } from './realGame.js';
import { PHONE } from './screens.js';

// The native arrow of a closed dropdown takes about this much of its inner width.
const ARROW_PX = 24;

test('every create-form option fits its dropdown on a 390 px phone', async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: PHONE })).newPage();
  await signIn(page, 'host');
  await page.goto('/#/host/new');
  await page.getByTestId('create-start-rule').selectOption('at');
  const cut = await page.evaluate((arrow) => {
    const ctx = document.createElement('canvas').getContext('2d');
    const out: string[] = [];
    if (ctx === null) return ['no canvas'];
    for (const select of document.querySelectorAll<HTMLSelectElement>('main select')) {
      const css = getComputedStyle(select);
      ctx.font = `${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
      const room =
        select.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight) - arrow;
      for (const option of select.options) {
        const width = ctx.measureText(option.text).width;
        if (width > room)
          out.push(`${option.text} (${String(Math.round(width))} > ${String(room)})`);
      }
    }
    return out;
  }, ARROW_PX);
  expect(cut).toEqual([]);
  await page.context().close();
});
