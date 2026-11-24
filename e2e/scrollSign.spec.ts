/**
 * @file   e2e/scrollSign.spec.ts
 * @module e2e
 * @brief  The "More below" sign is a strip in its own band at the bottom of a scrolling box.
 *
 * Responsibility: with the real stylesheet (apps/web/src/scrollHint.css) and the kit's tokens on a
 *                 box that scrolls under the dock, the sign (the box's ::after) is a full-width
 *                 strip with an opaque ground at the bottom edge, so no text or mark shows behind
 *                 or beside it, and it takes no room: the box's content is as tall with it as
 *                 without it (owner decision of 2026-11-24). No game, no server: a static page.
 * Depends on:     node:fs, node:path, @playwright/test, ./devStack
 * Spec:           docs/concepts/fit-audit.md §8
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { REPO_ROOT } from './devStack.js';

const TOKENS = path.join(REPO_ROOT, 'apps/web/node_modules/@seasonal/kit/css/tokens.css');
const SIGN = path.join(REPO_ROOT, 'apps/web/src/scrollHint.css');

const rows = Array.from(
  { length: 12 },
  (_, i) => `<p style="margin:0;height:24px">row ${String(i)}</p>`,
);

test('the sign is an opaque full-width strip at the bottom edge and takes no room', async ({
  page,
}) => {
  await page.setContent(
    `<div class="sk-docked"><div id="box" data-more="true" style="height:120px;width:300px;overflow:auto">${rows.join('')}</div></div>`,
  );
  await page.addStyleTag({ content: readFileSync(TOKENS, 'utf8') });
  await page.addStyleTag({ content: readFileSync(SIGN, 'utf8') });
  const sign = await page.evaluate(() => {
    const box = document.getElementById('box');
    if (box === null) throw new Error('no box');
    const withSign = box.scrollHeight;
    const s = getComputedStyle(box, '::after');
    const read = {
      width: parseFloat(s.width),
      bottom: s.bottom,
      position: s.position,
      radius: s.borderTopLeftRadius,
      ground: s.backgroundColor,
    };
    box.dataset['more'] = 'false';
    const without = box.scrollHeight;
    return {
      withSign,
      without,
      client: box.clientWidth,
      ...read,
    };
  });
  expect(sign.position).toBe('sticky');
  expect(sign.bottom).toBe('0px');
  // The strip spans the box (not a pill that leaves text showing beside it) ...
  expect(sign.width).toBe(sign.client);
  expect(sign.radius).toBe('0px');
  // ... on an opaque ground, and the content is as tall with it as without it.
  expect(sign.ground).not.toMatch(/rgba\(.*, 0\)$/);
  expect(sign.withSign).toBe(sign.without);
});
