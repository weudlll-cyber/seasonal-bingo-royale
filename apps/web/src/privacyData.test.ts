/**
 * @file   apps/web/src/privacyData.test.ts
 * @module web
 * @brief  The privacy data list answers every question for every piece of personal data (K107).
 *
 * Responsibility: docs/PRIVACY-DATA.md has the kit template's columns and no unanswered cell
 *                 (the kit's `findPrivacyGaps`); whether it names everything stored is a person's
 *                 review.
 * Depends on:     node:fs, vitest, @seasonal/kit/testing
 * Spec:           docs/PRIVACY-DATA.md; kit docs/HANDBOOK.md "Before production"
 */
import { readFileSync } from 'node:fs';

import { findPrivacyGaps } from '@seasonal/kit/testing';
import { describe, expect, it } from 'vitest';

describe('the privacy data list', () => {
  it('answers every column for every piece of personal data', () => {
    const list = readFileSync(new URL('../../../docs/PRIVACY-DATA.md', import.meta.url), 'utf8');
    expect(findPrivacyGaps(list)).toEqual([]);
  });
});
