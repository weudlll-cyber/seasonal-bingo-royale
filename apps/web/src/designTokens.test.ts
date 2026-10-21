/**
 * @file   apps/web/src/designTokens.test.ts
 * @module web
 * @brief  WCAG AA contrast of the design tokens in the light and the dark theme (01 §13).
 *
 * Responsibility: read the shared tokens (@sbr/ui) and check, in both themes, that body and
 *                 muted text keep 4.5:1 on the page, the opaque surfaces and the translucent
 *                 cards — composited over the base colour and over each of the four token
 *                 glows, as the website measures — and on the top bar's gradient stops; the
 *                 solid pill and text on the season colours keep 4.5:1; the bingo card ink
 *                 keeps 7:1 (the hero element); the host's Draw next keeps 4.5:1 enabled and
 *                 disabled; and the motion file turns every animation off under
 *                 prefers-reduced-motion.
 * Depends on:     node:fs, vitest, @sbr/ui/tokens.css, @sbr/ui/motion.css (raw), ./game/game.css
 * Spec:           docs/spec/01-game-design.md §13 (WCAG 2.2 AA)
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import motionCss from '@sbr/ui/motion.css?raw';
import tokensCss from '@sbr/ui/tokens.css?raw';

type Rgba = readonly [number, number, number, number];

// The text of one block of tokens.css.
function blockText(selector: string): string {
  const start = tokensCss.indexOf(`${selector} {`);
  return tokensCss.slice(start, tokensCss.indexOf('\n}', start));
}

// A colour as #rrggbb or rgb(r g b / a%).
function parse(value: string): Rgba {
  const hex = /#([0-9a-f]{6})/i.exec(value)?.[1];
  if (hex !== undefined) {
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(1) as unknown as Rgba;
  }
  const m = /rgb\((\d+) (\d+) (\d+)(?: \/ (\d+)%)?\)/.exec(value);
  if (m === null) throw new Error(`not a colour: ${value}`);
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4]) / 100];
}

// The single-colour custom properties of a block.
function colours(selector: string): Record<string, string> {
  const entries = [
    ...blockText(selector).matchAll(/--([\w-]+):\s*(#[0-9a-f]{6}|rgb\([^)]*\));/gi),
  ].map((m): [string, string] => [m[1] ?? '', m[2] ?? '']);
  return Object.fromEntries(entries);
}

// Every rgb()/hex colour inside one multi-part token (the glows, the gradient stops).
function parts(selector: string, name: string): Rgba[] {
  const text = blockText(selector);
  const start = text.indexOf(`--${name}:`);
  const body = text.slice(start, text.indexOf(';', start));
  return [...body.matchAll(/#[0-9a-f]{6}|rgb\([^)]*\)/gi)].map((m) => parse(m[0]));
}

// A translucent colour laid over an opaque one.
function over(top: Rgba, base: Rgba): Rgba {
  const a = top[3];
  return [0, 1, 2]
    .map((i) => (top[i] ?? 0) * a + (base[i] ?? 0) * (1 - a))
    .concat(1) as unknown as Rgba;
}

function luminance(c: Rgba): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
}

function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const THEMES = {
  light: { selector: ':root', set: colours(':root') },
  dark: {
    selector: ":root[data-theme='dark']",
    set: { ...colours(':root'), ...colours(":root[data-theme='dark']") },
  },
} as const;

// Everything text sits on in a theme: page, surfaces, cards over the base and each glow.
function backgrounds(theme: keyof typeof THEMES): [string, Rgba][] {
  const { selector, set } = THEMES[theme];
  const c = (name: string) => parse(set[name] ?? '');
  const base = c('color-background');
  const glows = parts(selector, 'page-background')
    .filter((g) => g[3] < 1)
    .map((g) => over(g, base));
  const list: [string, Rgba][] = [
    ['page', base],
    ['surface', c('color-surface')],
    ['surface-2', c('color-surface-2')],
    ['card', over(c('color-card'), base)],
    ...glows.map((g, i): [string, Rgba] => [`glow ${String(i + 1)}`, g]),
    ...glows.map((g, i): [string, Rgba] => [
      `card on glow ${String(i + 1)}`,
      over(c('color-card'), g),
    ]),
  ];
  return list;
}

describe('token contrast (WCAG AA), light and dark', () => {
  it.each(['light', 'dark'] as const)('%s: text and muted text keep 4.5:1 everywhere', (theme) => {
    const set = THEMES[theme].set;
    for (const [where, bg] of backgrounds(theme)) {
      for (const text of ['color-text', 'color-text-muted']) {
        expect(
          contrast(parse(set[text] ?? ''), bg),
          `${theme}: ${text} on ${where}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it.each(['light', 'dark'] as const)(
    '%s: the top bar, the solid pill, danger and success',
    (theme) => {
      const { selector, set } = THEMES[theme];
      const text = parse(set['color-text'] ?? '');
      const stops = parts(selector, 'sidebar-background');
      // Dark: the translucent token tints lie over the bar's own opaque colour (the last part).
      const opaque = stops.at(-1) ?? [0, 0, 0, 1];
      for (const stop of stops) {
        expect(
          contrast(text, stop[3] < 1 ? over(stop, opaque) : stop),
          `${theme}: bar text`,
        ).toBeGreaterThanOrEqual(4.5);
      }
      expect(
        contrast(parse(set['color-on-solid'] ?? ''), parse(set['color-solid'] ?? '')),
      ).toBeGreaterThanOrEqual(4.5);
      for (const status of ['color-danger', 'color-success']) {
        for (const bg of ['color-surface', 'color-surface-2']) {
          expect(
            contrast(parse(set[status] ?? ''), parse(set[bg] ?? '')),
            `${theme}: ${status} on ${bg}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    },
  );
});

describe('token contrast (WCAG AA), arena and controls', () => {
  it('keeps text on every season colour and the bingo card ink readable', () => {
    const set = THEMES.light.set;
    const c = (name: string) => parse(set[name] ?? '');
    for (const season of ['spring', 'summer', 'autumn', 'winter']) {
      expect(contrast(c('color-on-season'), c(`color-${season}`))).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(c('color-bingo-card-ink'), c('color-bingo-card'))).toBeGreaterThanOrEqual(7);
    expect(
      contrast(c('color-bingo-card-marked-ink'), c('color-bingo-card-marked')),
    ).toBeGreaterThanOrEqual(7);
  });

  it("keeps the host's Draw next at 4.5:1 enabled and disabled, in both themes", () => {
    const gameCss = readFileSync(new URL('./game/game.css', import.meta.url), 'utf8');
    const start = gameCss.indexOf('.host-draw:disabled {');
    const disabled = gameCss.slice(start, gameCss.indexOf('}', start));
    // Disabled: no fading; muted text on surface-2.
    expect(disabled).toContain('opacity: 1;');
    expect(disabled).toContain('color: var(--color-text-muted);');
    expect(disabled).toContain('background: var(--color-surface-2);');
    for (const { set } of Object.values(THEMES)) {
      const c = (name: string) => parse(set[name] ?? '');
      // Enabled: the primary button, the solid pill.
      expect(contrast(c('color-on-solid'), c('color-solid'))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c('color-text-muted'), c('color-surface-2'))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('switches every animation off under prefers-reduced-motion', () => {
    expect(motionCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important/,
    );
  });
});
