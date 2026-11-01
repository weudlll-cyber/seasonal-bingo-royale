/**
 * @file   apps/web/src/quicktest/testMatchSetup.ts
 * @module web/quicktest
 * @brief  A real test match from existing routes: create, join, fill with bots, start (dev only).
 *
 * Responsibility: the test match's choices and defaults (game type, start now or in N minutes,
 *                 bots per game type, draws, "I play along", short royale rounds), the limits
 *                 of the bots field, the POST /matches body built by the create form's own
 *                 `createBody` (a set start time with "Start automatically", D16), and the
 *                 calls in order: create, join as a player, bots, and for "Now" the host's
 *                 Start with the normal countdown, run by `useCreateTestMatch` for the form:
 *                 the host console in a new tab opened in the click, this tab to the match's
 *                 normal player route. No new game mechanism.
 * Depends on:     react, ../host/createForm, ../drawControl, ../game/labels, ../shell/http,
 *                 ../shell/router, ../types
 * Used by:        ./TestMatch
 * Spec:           docs/spec/01-game-design.md §7.6 (D16); docs/spec/05-api-design.md §2.3, §2.3a
 */
import { useState } from 'react';

import { INITIAL_CONTROL, type DrawControl } from '../drawControl.js';
import { problemText } from '../game/labels.js';
import { createBody, INITIAL, MAX_PLAYERS } from '../host/createForm.js';
import { api, ApiError } from '../shell/http.js';
import { hrefOf, navigate } from '../shell/router.js';
import type { GameType } from '../types.js';

// "Now": the host's Start with the 10-second countdown; else a set time N minutes ahead.
export type StartChoice =
  { readonly kind: 'now' } | { readonly kind: 'in'; readonly minutes: number };

export interface TestMatchValues {
  readonly gameType: GameType;
  readonly start: StartChoice;
  readonly bots: number;
  readonly draw: DrawControl;
  readonly playAlong: boolean;
  // The server's fast test profile: short royale rounds (development only).
  readonly fast: boolean;
}

// Royale: 8 players give every cut of the default ruleset something to do (8 → 4 → 2);
// a classic match needs only a few opponents.
export const DEFAULT_BOTS: Readonly<Record<GameType, number>> = {
  royale: 7,
  classicSeasons: 3,
  classic: 3,
};

export const INITIAL_TEST_MATCH: TestMatchValues = {
  gameType: 'royale',
  start: { kind: 'in', minutes: 1 },
  bots: DEFAULT_BOTS.royale,
  draw: INITIAL_CONTROL,
  playAlong: true,
  fast: false,
};

// Places kept free beyond the bots and the owner, for dev players in other windows.
const SPARE_PLACES = 3;

const MINUTE_MS = 60_000;

// The server wants a set time at least a minute ahead on arrival: a little room for the trip.
const ARRIVAL_SLACK_MS = 2_000;

// A match needs two players: with the owner playing one bot is enough. The bots and the
// owner fit into the largest match.
export function botLimits(playAlong: boolean): { readonly min: number; readonly max: number } {
  return playAlong ? { min: 1, max: MAX_PLAYERS - 1 } : { min: 2, max: MAX_PLAYERS };
}

function playersOf(v: TestMatchValues): number {
  const { min, max } = botLimits(v.playAlong);
  const bots = Number.isFinite(v.bots) ? Math.min(max, Math.max(min, Math.round(v.bots))) : min;
  return bots + (v.playAlong ? 1 : 0);
}

// The POST /matches body: the create form's body with this test's choices.
export function testMatchBody(v: TestMatchValues, now: number) {
  const players = playersOf(v);
  const body = createBody({
    ...INITIAL,
    title: 'Test match',
    gameType: v.gameType,
    draw: v.draw,
    maxPlayers: Math.min(MAX_PLAYERS, players + SPARE_PLACES),
    fast: v.gameType === 'royale' && v.fast,
  });
  const minutes = v.start.kind === 'in' ? Math.max(1, Math.round(v.start.minutes)) : 0;
  const startRule =
    v.start.kind === 'now'
      ? { kind: 'host' as const }
      : { kind: 'at' as const, at: now + minutes * MINUTE_MS + ARRIVAL_SLACK_MS, auto: true };
  return { ...body, startRule };
}

// Creates the match and sets it up; `onCreated` hears the code as soon as the match
// exists, so a later failure still leaves the owner a way to the console (and to Abort).
export async function createTestMatch(
  v: TestMatchValues,
  onCreated: (code: string) => void,
): Promise<string> {
  const body = testMatchBody(v, Date.now());
  const { code } = await api<{ code: string }>('/matches', { method: 'POST', body });
  onCreated(code);
  const post = (path: string, data: unknown) =>
    api(`/matches/${code}/${path}`, { method: 'POST', body: data });
  // The owner joins first, so the bots fill the places after them.
  if (v.playAlong) await post('join', {});
  await post('bots', { upTo: playersOf(v) });
  if (v.start.kind === 'now') await post('start', {});
  return code;
}

// The host console's own tab: opened empty inside the click (a window.open after the
// server's answer would be blocked), sent to the console once the match exists.
function sendToConsole(tab: Window, code: string): void {
  tab.location.href = new URL(hrefOf({ name: 'host', code }), window.location.href).href;
}

// Runs the setup once: busy until it ends. Once the bots are in, this tab goes to the
// match's normal player route (the waiting room); the console tab already shows the match.
// A blocked tab, or a step that fails after the match exists, stays here: `onOpened` gets
// the code for the links, with the message beside it.
export function useCreateTestMatch(handlers: {
  readonly values: TestMatchValues;
  readonly onOpened: (code: string) => void;
  readonly onError: (error: string | null) => void;
}): { readonly busy: boolean; readonly create: () => void } {
  const { values, onOpened, onError } = handlers;
  const [busy, setBusy] = useState(false);
  const create = (): void => {
    setBusy(true);
    onError(null);
    const tab = window.open('', '_blank');
    let created: string | null = null;
    createTestMatch(values, (c) => {
      created = c;
      if (tab !== null) sendToConsole(tab, c);
    })
      .then((code) => {
        if (tab !== null) {
          navigate({ name: 'match', code });
          return;
        }
        setBusy(false);
        onOpened(code);
      })
      .catch((e: unknown) => {
        setBusy(false);
        onError(e instanceof ApiError ? problemText(e.code, e.reason) : problemText(''));
        if (created !== null) onOpened(created);
        else tab?.close();
      });
  };
  return { busy, create };
}
