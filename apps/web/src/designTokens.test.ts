/**
 * @file   apps/web/src/designTokens.test.ts
 * @module web
 * @brief  WCAG AA contrast of the design tokens, in both themes (01 §13).
 *
 * Responsibility: read the shared tokens (@sbr/ui) the client renders with and check that body and muted text keep at least
 *                 4.5:1 on every surface of their theme, that text on a season colour
 *                 keeps 4.5:1 on all four seasons, that the card ink keeps 7:1 on the card
 *                 (the hero element, numbers at a glance), that the host's Draw next keeps
 *                 4.5:1 enabled and disabled, and that the motion file turns every
 *                 animation off under prefers-reduced-motion.
 * Depends on:     node:fs, vitest, @sbr/ui/tokens.css, @sbr/ui/motion.css (raw), ./game/game.css
 * Spec:           docs/spec/01-game-design.md §13 (WCAG 2.2 AA)
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import motionCss from '@sbr/ui/motion.css?raw';
import tokensCss from '@sbr/ui/tokens.css?raw';

// The custom properties declared in one block of tokens.css.
function block(selector: string): Record<string, string> {
  const text = tokensCss;
  const start = text.indexOf(`${selector} {`);
  const body = text.slice(start, text.indexOf('\n}', start));
  const entries = [...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map(
    (m): [string, string] => [m[1] ?? '', m[2] ?? ''],
  );
  return Object.fromEntries(entries);
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const dark = block(':root');
const light = { ...dark, ...block(":root[data-theme='light']") };
const SURFACES = ['background', 'sidebar', 'surface', 'surface-2', 'active-bg'];

describe('token contrast (WCAG AA)', () => {
  it.each([
    ['dark', dark],
    ['light', light],
  ])('%s: text and muted text keep 4.5:1 on every surface', (_name, set) => {
    for (const surface of SURFACES) {
      for (const text of ['text', 'text-muted']) {
        expect(
          contrast(set[`color-${text}`] ?? '', set[`color-${surface}`] ?? ''),
          `${text} on ${surface}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps text on every season colour and the card ink readable', () => {
    for (const season of ['spring', 'summer', 'autumn', 'winter']) {
      expect(
        contrast(dark['color-on-season'] ?? '', dark[`color-${season}`] ?? ''),
      ).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(dark['color-card-ink'] ?? '', dark['color-card'] ?? '')).toBeGreaterThanOrEqual(
      7,
    );
    expect(
      contrast(dark['color-card-marked-ink'] ?? '', dark['color-card-marked'] ?? ''),
    ).toBeGreaterThanOrEqual(7);
  });

  it("keeps the host's Draw next at 4.5:1 enabled and disabled", () => {
    const gameCss = readFileSync(new URL('./game/game.css', import.meta.url), 'utf8');
    const rule = (selector: string) => {
      const start = gameCss.indexOf(`${selector} {`);
      return gameCss.slice(start, gameCss.indexOf('}', start));
    };
    // Enabled: the primary button, ink on Winter.
    expect(
      contrast(dark['color-on-season'] ?? '', dark['color-winter'] ?? ''),
    ).toBeGreaterThanOrEqual(4.5);
    // Disabled: no fading; muted text on surface-2 in both themes.
    const disabled = rule('.host-draw:disabled');
    expect(disabled).toContain('opacity: 1;');
    expect(disabled).toContain('color: var(--color-text-muted);');
    expect(disabled).toContain('background: var(--color-surface-2);');
    for (const set of [dark, light]) {
      expect(
        contrast(set['color-text-muted'] ?? '', set['color-surface-2'] ?? ''),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('switches every animation off under prefers-reduced-motion', () => {
    expect(motionCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important/,
    );
  });
});
