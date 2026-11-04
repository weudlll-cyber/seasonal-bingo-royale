// @vitest-environment jsdom
/**
 * @file   apps/web/src/game/roundWithoutCut.test.tsx
 * @module web/game
 * @brief  A royale round that ends without a cut (the qualification cuts after the stage, 01 §7.1).
 *
 * Responsibility: in the pause after the first of two qualification rounds the player sees
 *                 the round's recap without a cut card and no cut screen; in the stage's next
 *                 round "Patterns this round" lists the stage's patterns again, all still open,
 *                 and the cut screen stays away until the stage's cut comes.
 * Depends on:     @testing-library/react, @sbr/contracts (types), vitest, ./MatchScreen,
 *                 ../test/*
 * Spec:           docs/spec/01-game-design.md §7.1, §7 (D20), §8.1, §13
 */
import type { RoundRecap } from '@sbr/contracts';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { matchSummary, serveMatch, show } from '../test/matchFixture.js';
import { numberCard, royaleFixture } from '../test/quickTestFixture.js';
import type { QuickTestResult } from '../types.js';
import { MatchScreen } from './MatchScreen.js';

vi.mock('./socket.js', () => ({
  gameSocket: () => ({ on: () => undefined, off: () => undefined, connected: false }),
  intent: () => Promise.resolve({ ok: true }),
  resetSocket: () => undefined,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// The recap of round 1: no cut followed it.
const RECAP: RoundRecap = {
  roundIndex: 0,
  top: [{ name: 'bot-02', points: 130 }],
  facts: { numbersDrawn: 2, playersLeft: 3 },
};

// The fixture's first round (through its end, index 9) in a qualification of two rounds,
// with bot-02 first to a row; `next` adds the stage's second round and its first draw.
function qualification(next: boolean): QuickTestResult {
  const base = royaleFixture();
  const [first, ...rest] = base.stagePlan;
  const scored = {
    type: 'patternScored' as const,
    accountId: 'bot-02',
    cardIndex: 0,
    prizeKey: 'rows-1',
    points: 150,
    firstInRound: true,
  };
  const r1 = base.events.slice(0, 8);
  const r1End = base.events.slice(8, 10);
  const all = { 'owner-01': [numberCard(5)], 'bot-02': [numberCard(6)], 'bot-03': [numberCard(7)] };
  const round2: QuickTestResult['events'] = [
    {
      type: 'roundStarted',
      roundIndex: 1,
      stageIndex: 0,
      roundInStage: 1,
      drawSequence: [9],
      cardsByPlayer: all,
    },
    { type: 'drawMade', drawIndex: 0, item: 9 },
  ];
  return {
    ...base,
    stagePlan: first === undefined ? rest : [{ ...first, rounds: 2 }, ...rest],
    cuts: [],
    recaps: [RECAP],
    events: [...r1, scored, ...r1End, ...(next ? round2 : [])],
  };
}

const motionOff = (): void => {
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
};

describe('a royale round without a cut (01 §7.1)', () => {
  it('shows the recap in the pause, without a cut card or cut screen', async () => {
    motionOff();
    serveMatch(matchSummary({ status: 'running' }), qualification(false));
    await show(<MatchScreen code="MATCH1" />);
    expect(screen.getByTestId('interlude')).toBeTruthy();
    expect(screen.queryByTestId('interlude-card-cut')).toBeNull();
    expect(screen.queryByTestId('recap-out')).toBeNull();
    expect(screen.queryByTestId('cut-screen')).toBeNull();
  });

  it("lists the stage's patterns again in its next round, all still open", async () => {
    motionOff();
    serveMatch(matchSummary({ status: 'running' }), qualification(true));
    await show(<MatchScreen code="MATCH1" />);
    expect(screen.getByTestId('pattern-rows-1').textContent).toContain('still open');
    expect(screen.getByTestId('pattern-fourCorners').textContent).toContain('still open');
    expect(screen.queryByTestId('cut-screen')).toBeNull();
    expect(screen.queryByTestId('interlude')).toBeNull();
  });
});
