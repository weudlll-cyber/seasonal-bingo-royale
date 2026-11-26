/**
 * @file   apps/web/src/noFixedColours.test.ts
 * @module web
 * @brief  No component hard-codes a colour: every screen works in the light and dark theme.
 *
 * Responsibility: the kit's guard (`findFixedColours`) over every .tsx file of the client (the
 *                 Quick Test included): colours come from the @sbr/ui and kit tokens (the season
 *                 colours from ./types). A fixed dark colour would break the light theme.
 * Depends on:     @seasonal/kit/testing
 * Spec:           docs/spec/01-game-design.md §13
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findFixedColours } from '@seasonal/kit/testing';
import { describe, expect, it } from 'vitest';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

describe('theme-safe components', () => {
  it('uses tokens, never a fixed hex colour, in every component', () => {
    expect(findFixedColours([ROOT])).toEqual([]);
  });
});
