/**
 * @file   apps/web/src/game/labels.test.ts
 * @module web/game
 * @brief  The plain-English builders: grammar, prize names, unknown reasons and codes (POLISH-1).
 *
 * Responsibility: a cut line says "1 goes on, 1 is out" for one player; prize keys become
 *                 words; an unknown round-end reason or server code never shows itself; a
 *                 refusal under maintenance carries the operator's reason (D22).
 * Depends on:     vitest, ./labels
 * Spec:           docs/spec/01-game-design.md §3a.1, §7.3, §7.4, §7.6 (D22), §13
 */
import { describe, expect, it } from 'vitest';

import { cutLine, prizeName, problemText, roundEndLine } from './labels.js';

describe('plain-English labels', () => {
  it('counts one player in the singular', () => {
    expect(cutLine({ number: 3, survivors: 1, eliminated: 1, saved: 0 })).toBe(
      'Cut 3: 1 goes on, 1 is out',
    );
    expect(cutLine({ number: 1, survivors: 12, eliminated: 8, saved: 2 })).toBe(
      'Cut 1: 12 go on, 8 are out (2 saved by Winter shield)',
    );
  });

  it('names every prize in words', () => {
    expect(prizeName('rows-1')).toBe('1 row');
    expect(prizeName('columns-2')).toBe('2 columns');
    expect(prizeName('fourCorners')).toBe('Four corners');
  });

  it('never shows an unknown reason or code', () => {
    expect(
      roundEndLine({ roundIndex: 0, reason: 'someNewReason', draws: 3, lastScorer: null }),
    ).toBe('Round 1 over');
    expect(problemText('SOME_NEW_CODE')).toBe('Something went wrong — please try again.');
  });

  it("says why a start is refused under maintenance, with the operator's reason (D22)", () => {
    expect(problemText('MAINTENANCE', 'Update at 22:00')).toBe(
      'Maintenance is on — matches cannot start now. Update at 22:00',
    );
    expect(problemText('MAINTENANCE')).toBe('Maintenance is on — matches cannot start now.');
    expect(problemText('MATCH_STARTING')).toBe('The countdown is already running.');
  });
});
