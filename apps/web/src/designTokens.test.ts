/**
 * @file   apps/web/src/designTokens.test.ts
 * @module web
 * @brief  WCAG AA contrast of the design tokens in the light and the dark theme (01 §13).
 *
 * Responsibility: name the colour pairs Bingo draws and check them with the kit's guard
 *                 (`findLowContrast`: the tokens as the page loads them, the kit's shared file,
 *                 then @sbr/ui's own, both themes, translucent layers composited): body and muted
 *                 text 4.5:1 on the page, opaque surfaces and translucent cards over the base and
 *                 the page's glows, text on the top bar's gradient; the solid pill, danger,
 *                 success and text on season colours 4.5:1; bingo card ink 7:1 (the hero element);
 *                 Draw next 4.5:1 enabled and disabled; the kit's motion file turns every
 *                 animation off under prefers-reduced-motion.
 * Depends on:     @seasonal/kit/testing, @seasonal/kit/tokens.css, @seasonal/kit/motion.css,
 *                 @sbr/ui/tokens.css (raw), ./host/host.css
 * Spec:           docs/spec/01-game-design.md §13 (WCAG 2.2 AA)
 */
import { readFileSync } from 'node:fs';

import { findLowContrast, type ContrastPair } from '@seasonal/kit/testing';
import { describe, expect, it } from 'vitest';

import motionCss from '@seasonal/kit/motion.css?raw';
import kitTokensCss from '@seasonal/kit/tokens.css?raw';
import gameTokensCss from '@sbr/ui/tokens.css?raw';

// In the page's order: the game's file is loaded after the kit's (apps/web/src/main.tsx).
const CSS = [kitTokensCss, gameTokensCss];
const shortOf = (pairs: readonly ContrastPair[]): string[] => findLowContrast({ css: CSS, pairs });

const BASE = '--sk-color-background';
const GLOWS = '--sk-page-background';
const CARD = '--sk-color-card';

// Everything body and muted text sit on: page, surfaces, cards over the base and the glows.
const BACKGROUNDS = [
  [BASE],
  ['--sk-color-surface'],
  ['--sk-color-surface-2'],
  [BASE, CARD],
  [BASE, GLOWS],
  [BASE, GLOWS, CARD],
];

describe('token contrast (WCAG AA), light and dark', () => {
  it('keeps text and muted text at 4.5:1 everywhere', () => {
    const pairs = ['--sk-color-text', '--sk-color-text-muted'].flatMap((text) =>
      BACKGROUNDS.map((on) => ({ text, on })),
    );
    expect(shortOf(pairs)).toEqual([]);
  });

  it('keeps the top bar, the solid pill, danger and success readable', () => {
    const status = ['--sk-color-danger', '--sk-color-success'].flatMap((text) =>
      ['--sk-color-surface', '--sk-color-surface-2'].map((on) => ({ text, on: [on] })),
    );
    expect(
      shortOf([
        // The bar's gradient stops over the page (in the dark theme its tints are translucent).
        { text: '--sk-color-text', on: [BASE, '--sk-sidebar-background'] },
        { text: '--sk-color-on-solid', on: ['--sk-color-solid'] },
        ...status,
      ]),
    ).toEqual([]);
  });
});

describe('token contrast (WCAG AA), arena and controls', () => {
  it('keeps text on every season colour and the bingo card ink readable', () => {
    const seasons = ['spring', 'summer', 'autumn', 'winter'].map((season) => ({
      text: '--sk-color-on-season',
      on: [`--sk-color-${season}`],
    }));
    expect(
      shortOf([
        ...seasons,
        { text: '--color-bingo-card-ink', on: ['--color-bingo-card'], min: 7 },
        { text: '--color-bingo-card-marked-ink', on: ['--color-bingo-card-marked'], min: 7 },
      ]),
    ).toEqual([]);
  });

  it("keeps the host's Draw next at 4.5:1 enabled and disabled, in both themes", () => {
    const hostCss = readFileSync(new URL('./host/host.css', import.meta.url), 'utf8');
    const start = hostCss.indexOf('.host-draw:disabled {');
    const disabled = hostCss.slice(start, hostCss.indexOf('}', start));
    // Disabled: no fading; muted text on surface-2.
    expect(disabled).toContain('opacity: 1;');
    expect(disabled).toContain('color: var(--sk-color-text-muted);');
    expect(disabled).toContain('background: var(--sk-color-surface-2);');
    expect(
      shortOf([
        // Enabled: the primary button, the solid pill.
        { text: '--sk-color-on-solid', on: ['--sk-color-solid'] },
        { text: '--sk-color-text-muted', on: ['--sk-color-surface-2'] },
      ]),
    ).toEqual([]);
  });

  it('switches every animation off under prefers-reduced-motion', () => {
    expect(motionCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important/,
    );
  });
});
