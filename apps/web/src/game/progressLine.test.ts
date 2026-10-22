/**
 * @file   apps/web/src/game/progressLine.test.ts
 * @module web/game
 * @brief  The match header's progress line, also in the pause between royale rounds.
 *
 * Responsibility: during a round the line names its stage, round and draw; in the pause
 *                 after it, the ended round with its own stage ("round 1 over"), and once
 *                 the next stage has begun, that stage as next — never the new stage with
 *                 the old round's draw count (seen by the owner in NIGHT-3).
 * Depends on:     vitest, ./labels, ../playback, ../quickTestFixture
 * Spec:           docs/spec/01-game-design.md §13
 */
import { describe, expect, it } from 'vitest';

import { playbackAt } from '../playback.js';
import { royaleFixture } from '../quickTestFixture.js';
import { progressText } from './labels.js';
import type { LiveState } from './useLiveMatch.js';

const result = royaleFixture();
const live = { view: result } as unknown as LiveState;
const at = (type: string, nth = 1): number => {
  let seen = 0;
  return result.events.findIndex((e) => e.type === type && (seen += 1) === nth) + 1;
};
const line = (step: number): string => progressText(live, playbackAt(result, step));

describe('the progress line', () => {
  it('names the stage, round and draw during a round', () => {
    expect(line(at('drawMade'))).toBe('Battle royale · stage 1 (qualification) · round 1 · draw 1');
  });

  it('shows the pause consistently: the ended round, then the next stage', () => {
    const ended = 'Battle royale · stage 1 (qualification) · round 1 over';
    expect(line(at('roundEnded'))).toBe(ended);
    expect(line(at('cutApplied'))).toBe(ended);
    expect(line(at('stageStarted', 2))).toBe(`${ended} · stage 2 (final) next`);
    expect(line(at('roundStarted', 2))).toBe('Battle royale · stage 2 (final) · round 2 · draw 0');
  });
});
