/**
 * @file   e2e/acceptance/recap.ts
 * @module e2e/acceptance
 * @brief  The round recap between royale rounds (D20), asserted during the real-game play-through.
 *
 * Responsibility: in a pause the host ends, the host and every player — also one already
 *                 out — see the interlude; while its cards go round, nothing a player sees of
 *                 the standings or their points moves, and the server's points stay the same
 *                 (the recap is for fun only). Answers how many screens saw it and how many
 *                 of the players were already out.
 * Depends on:     @playwright/test, ./livePlayer (types), ./liveSnap, ./serverView
 * Used by:        the acceptance Playwright specs (test helper)
 * Spec:           docs/spec/01-game-design.md §7 (D20)
 */
import { expect, type Page } from '@playwright/test';

import type { LivePlayer } from './livePlayer.js';
import { liveSnap } from './liveSnap.js';
import { serverView } from './serverView.js';

// One card's time at a calm pace (apps/web/src/game/interludePlan.ts) and some room.
const NEXT_CARD_MS = 8_000;

export interface RecapSeen {
  readonly screens: number;
  readonly outPlayers: number;
}

export async function checkRecap(
  host: Page,
  players: readonly LivePlayer[],
  code: string,
): Promise<RecapSeen> {
  for (const page of [host, ...players.map((p) => p.page)]) {
    await expect(page.getByTestId('interlude'), 'the recap between rounds').toBeVisible({
      timeout: 10_000,
    });
  }
  const before = await Promise.all(players.map((p) => liveSnap(p.page)));
  const server = await Promise.all(players.map((p) => serverView(p.page, code)));
  // The cards go round while the host decides: wait for the next card (if there is one).
  const step = host.getByTestId('interlude-step');
  const shown = await step.innerText();
  if (!shown.endsWith('of 1')) await expect(step).not.toHaveText(shown, { timeout: NEXT_CARD_MS });
  for (const [i, p] of players.entries()) {
    const after = await liveSnap(p.page);
    expect(after.standings, `${p.who}: standings unchanged by the recap`).toEqual(
      before[i]?.standings,
    );
    expect(after.points, `${p.who}: points unchanged by the recap`).toBe(before[i]?.points);
    expect((await serverView(p.page, code)).points, `${p.who}: server points unchanged`).toBe(
      server[i]?.points,
    );
  }
  const out = await Promise.all(
    players.map((p) =>
      p.page.locator('[data-testid^="standing-"].is-own').getAttribute('data-eliminated'),
    ),
  );
  return { screens: players.length + 1, outPlayers: out.filter((o) => o === 'true').length };
}
