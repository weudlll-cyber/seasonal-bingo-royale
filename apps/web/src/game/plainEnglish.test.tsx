// @vitest-environment jsdom
/**
 * @file   apps/web/src/game/plainEnglish.test.tsx
 * @module web/game
 * @brief  No internal identifier reaches the screen; one match log, newest first (POLISH-1).
 *
 * Responsibility: render the player's match screen, the host console and the Quick Test
 *                 playback over a match holding every round-end reason, a cut with a
 *                 shield save, Season Complete, the jackpot, every classic prize and an
 *                 abort; fail if any raw reason, event type, prize key or game type name
 *                 shows in the DOM text, and check the plain lines themselves; the player
 *                 screen holds one match log, newest first.
 * Depends on:     @testing-library/react, vitest, ./MatchScreen, ../host/HostConsole,
 *                 ../components/Playback, ../playback, @sbr/contracts (prize list),
 *                 ../test/quickTestFixture, ../shell/session, ../types
 * Spec:           docs/spec/01-game-design.md §7.3, §7.4, §8.3, §13
 */
import { BUILTIN_PRIZE_KEYS } from '@sbr/contracts';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Playback } from '../components/Playback.js';
import { HostConsole } from '../host/HostConsole.js';
import { playbackAt } from '../playback.js';
import { royaleFixture } from '../test/quickTestFixture.js';
import { SessionProvider } from '../shell/session.js';
import type { DomainEventLike, QuickTestResult } from '../types.js';
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

const REASONS = [
  'drawCount',
  'firstBingo',
  'bingoQuota',
  'firstFullHouse',
  'poolExhausted',
  'allPrizesAwarded',
];

const EVENT_TYPES = [
  'stageStarted',
  'roundStarted',
  'drawMade',
  'speedWindowClosed',
  'cellMarked',
  'seasonActivated',
  'patternScored',
  'seasonCompleteFired',
  'jackpotClaimed',
  'classicPrizeAwarded',
  'roundEnded',
  'cutApplied',
  'matchFinished',
  'matchAborted',
];

const RAW = [...REASONS, ...EVENT_TYPES, ...BUILTIN_PRIZE_KEYS, 'classicSeasons', 'shield save'];

// The fixture's match plus every event that makes a line: all reasons, a shield save,
// Season Complete, the jackpot, every prize and an abort.
function everyLine(gameType: QuickTestResult['gameType']): QuickTestResult {
  const base = royaleFixture();
  const extra: DomainEventLike[] = [
    {
      type: 'patternScored',
      accountId: 'bot-02',
      cardIndex: 0,
      prizeKey: 'fullCard',
      points: 5,
      firstInRound: true,
    },
    ...REASONS.map((reason, i) => ({ type: 'roundEnded' as const, roundIndex: 10 + i, reason })),
    {
      type: 'cutApplied',
      stageIndex: 1,
      survivors: ['bot-02', 'bot-03'],
      eliminated: [],
      shieldSaves: ['bot-03'],
    },
    { type: 'seasonCompleteFired', accountId: 'bot-02', points: 100 },
    { type: 'jackpotClaimed', accountId: 'bot-03', roundIndex: 1, value: 250 },
    ...BUILTIN_PRIZE_KEYS.map((prizeKey) => ({
      type: 'classicPrizeAwarded' as const,
      accountId: 'bot-02',
      prizeKey,
      drawIndex: 0,
    })),
    { type: 'matchAborted', reason: 'Power cut in the hall' },
  ];
  const events = [...base.events.slice(0, -1), ...extra, ...base.events.slice(-1)];
  return { ...base, gameType, tickedPrizes: BUILTIN_PRIZE_KEYS, events };
}

function expectPlain(text: string): void {
  for (const raw of RAW) expect(text, `"${raw}" on screen`).not.toContain(raw);
}

function serveLive(view: QuickTestResult, youHost: boolean): void {
  const match = {
    id: 'm',
    code: 'PLAIN1',
    title: 'Plain words',
    gameType: view.gameType,
    status: 'finished',
    players: 3,
    maxPlayers: 20,
    prizes: view.tickedPrizes,
    countsForLeaderboard: true,
    settings: {
      markingMode: 'manual',
      missedNumbers: { kind: 'noAutoMark' },
      drawMode: 'host',
      drawIntervalMs: 5000,
      roundPause: { kind: 'wait', ms: 6000 },
      startRule: { kind: 'host' },
    },
    startsAt: null,
    nextRoundAt: null,
    nextDrawAt: null,
    waitingForHost: false,
    youHost,
  };
  const session = {
    signedIn: true,
    account: { id: 'h', displayName: 'owner-01' },
    permissions: ['match.join', 'match.create'],
    csrfToken: 'x',
  };
  const body = (url: string) =>
    url.endsWith('/session') ? session : { match, seq: 0, since: 0, me: 'owner-01', view };
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => Promise.resolve(new Response(JSON.stringify(body(url))))),
  );
}

async function show(ui: React.ReactElement): Promise<string> {
  render(<SessionProvider>{ui}</SessionProvider>);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return document.body.textContent;
}

describe('plain English on every screen', () => {
  it.each(['royale', 'classicSeasons'] as const)(
    '%s: the player screen and the host console show no internal identifier',
    async (gameType) => {
      const view = everyLine(gameType);
      serveLive(view, false);
      const player = await show(<MatchScreen code="PLAIN1" />);
      expect(player).toContain('Round 11 over — all 1 number drawn');
      expect(player).toContain('Round 14 over — bot-02 filled the whole card');
      expect(player).toContain('Cut 2: 2 go on, 0 are out (1 saved by Winter shield)');
      expect(player).toContain('bot-02 collected all four seasons');
      expect(player).toContain('Full card won by bot-02 on draw 1 (B 4)');
      expect(player).toContain('Match cancelled by the host: Power cut in the hall');
      expectPlain(player);
      // One match log, newest first: the abort (last event before the finish) leads.
      const logs = document.querySelectorAll('[data-testid="match-log"]');
      expect(logs).toHaveLength(1);
      expect(document.querySelector('[data-testid="banners"]')).toBeNull();
      expect(logs[0]?.querySelector('li')?.textContent).toBe(
        'Match cancelled by the host: Power cut in the hall',
      );
      // At the end: what to do next, one ranking, the rule behind it, no in-play wording.
      expect(document.querySelector('[data-testid="end-actions"]')?.textContent).toContain(
        'Back to the lobby',
      );
      expect(document.querySelector('[data-testid="standings"]')).toBeNull();
      expect(document.querySelector('[data-testid="final-rule"]')).not.toBeNull();
      expect(player).toContain('Match over');
      expect(player).not.toContain('Speed window');
      cleanup();
      serveLive(view, true);
      const host = await show(<HostConsole code="PLAIN1" />);
      expect(host).toContain('Final placement');
      expectPlain(host);
    },
  );

  it('the Quick Test playback shows no internal identifier either', () => {
    const result = everyLine('classicSeasons');
    const { container } = render(
      <Playback result={result} view={playbackAt(result, result.events.length)} />,
    );
    expectPlain(container.textContent);
  });
});
