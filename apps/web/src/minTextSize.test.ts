/**
 * @file   apps/web/src/minTextSize.test.ts
 * @module web
 * @brief  No text below 14 px at the browser's default font, no card number below 16 px, no cut name.
 *
 * Responsibility: scan every stylesheet and component of the client and @sbr/ui, and the
 *                 @seasonal/kit style files the client loads (KIT_CSS), for fixed font sizes and
 *                 check the floor: text keeps 0.875rem (14 px; the kit's `findSmallText`), card
 *                 numbers (--cell-font) 1rem; sizes computed from a box are left to the e2e fit
 *                 checks. `small` gets the small size, never `smaller`. No text is cut with an
 *                 ellipsis, and a podium name never breaks inside its step (the podium turns into
 *                 rows).
 * Depends on:     @seasonal/kit/testing (reads the source files)
 * Spec:           docs/concepts/fit-audit.md §3 (F1–F7), §5 items 1, 2 and 6
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findSmallText } from '@seasonal/kit/testing';
import { describe, expect, it } from 'vitest';

const here = (rel: string) => path.resolve(path.dirname(fileURLToPath(import.meta.url)), rel);
const ROOTS = [here('.'), here('../../../packages/ui/src')];
// The kit's style files the client loads (its type sizes are in its tokens.css since B1).
const KIT_CSS = ['tokens.css', 'fit.css', 'call.css', 'frames.css', 'components.css'].map((name) =>
  here(`../node_modules/@seasonal/kit/css/${name}`),
);

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return /\.(css|tsx)$/.test(entry.name) && !entry.name.includes('.test.') ? [full] : [];
  });
}

const allSources = (): string[] => [...ROOTS.flatMap(sources), ...KIT_CSS];

const stripComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '');

// The arguments of a function call at the top level of `value` (commas inside brackets kept).
function args(value: string): string[] {
  const inner = value.slice(value.indexOf('(') + 1, value.lastIndexOf(')'));
  const out: string[] = [];
  let depth = 0;
  let part = '';
  for (const ch of inner) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(part.trim());
      part = '';
    } else part += ch;
  }
  return [...out, part.trim()];
}

// The smallest size a value can take, in px at a 16 px root; null when it depends on a box.
function floorPx(value: string): number | null {
  const v = value.trim();
  const fixed = /^([\d.]+)(rem|px)$/.exec(v);
  if (fixed !== null) return Number(fixed[1]) * (fixed[2] === 'rem' ? 16 : 1);
  if (/^(max|clamp)\(/.test(v)) return floorPx(args(v)[0] ?? '');
  if (/^var\(/.test(v)) {
    const fallback = args(v)[1];
    return fallback === undefined ? null : floorPx(fallback);
  }
  return null;
}

// Every `font-size:` / `fontSize:` value of the client, with its file and the name it sets.
function fontSizes(names: RegExp): { where: string; value: string }[] {
  return allSources().flatMap((file) =>
    [...stripComments(readFileSync(file, 'utf8')).matchAll(names)].map((m) => ({
      where: `${path.basename(file)}: ${m[1] ?? ''}`,
      value: (m[2] ?? '').replace(/^'|'$/g, ''),
    })),
  );
}

describe('minimum text size', () => {
  it('writes no text size below 14 px', () => {
    expect(findSmallText([...ROOTS, ...KIT_CSS])).toEqual([]);
  });

  it('writes no card number below 16 px (own card and watched cards)', () => {
    const below = fontSizes(/(--cell-font):\s*([^;\n]+)/g)
      .concat(fontSizes(/(fontSize): '(var\(--cell-font[^']*)'/g))
      .filter(({ value }) => (floorPx(value) ?? 99) < 16)
      .map(({ where, value }) => `${where} ${value}`);
    expect(below).toEqual([]);
  });

  it('never cuts a name with an ellipsis: rows wrap their figures instead (fit F7)', () => {
    const cut = allSources()
      .filter((file) =>
        stripComments(readFileSync(file, 'utf8')).includes('text-overflow: ellipsis'),
      )
      .map((file) => path.basename(file));
    expect(cut).toEqual([]);
  });

  it('never breaks a podium name inside its step: the podium turns into rows instead', () => {
    const podium = stripComments(readFileSync(here('components/podium.css'), 'utf8'));
    const name = /\n\.podium-name \{([^}]*)\}/.exec(podium)?.[1] ?? '';
    expect(name).toContain('white-space: nowrap;');
    expect(podium).not.toContain('overflow-wrap: anywhere');
    // Rows below the width three 24-character names need side by side (fit audit §6).
    const rows = Number(/@container \(max-width: ([\d.]+)rem\)/.exec(podium)?.[1] ?? 0);
    expect(rows).toBeGreaterThanOrEqual(46);
  });

  it('gives `small` the small size', () => {
    const base = readFileSync(here('../../../packages/ui/src/base.css'), 'utf8');
    expect(base).toMatch(/\nsmall \{[^}]*font-size: var\(--sk-font-size-small\);/);
  });
});
