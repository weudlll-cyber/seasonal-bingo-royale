/**
 * @file   apps/web/src/noFixedColours.test.ts
 * @module web
 * @brief  No component hard-codes a colour: every screen works in the light and dark theme.
 *
 * Responsibility: scan every .tsx file of the client (the Quick Test included) for a hex
 *                 colour outside comments; colours come from the @sbr/ui tokens (the season
 *                 colours from ./types). A fixed dark colour would break the light theme.
 * Depends on:     nothing (reads the source files)
 * Spec:           docs/spec/01-game-design.md §13
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return entry.name.endsWith('.tsx') && !entry.name.includes('.test.') ? [full] : [];
  });
}

// The code of a file without its comments.
const code = (text: string): string =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\/.*$/gm, '');

describe('theme-safe components', () => {
  it('uses tokens, never a fixed hex colour, in every component', () => {
    const offenders = sources(ROOT).flatMap((file) =>
      [...code(readFileSync(file, 'utf8')).matchAll(/#[0-9a-f]{3,8}\b/gi)].map(
        (m) => `${path.relative(ROOT, file)}: ${m[0]}`,
      ),
    );
    expect(offenders).toEqual([]);
  });
});
