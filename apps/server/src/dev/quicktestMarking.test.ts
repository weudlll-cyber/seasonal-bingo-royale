/**
 * @file   apps/server/src/dev/quicktestMarking.test.ts
 * @module server/dev
 * @brief  Quick Test marking is per player: bots mark on the draw in manual mode (01 §6).
 *
 * Responsibility: with seed `probe-1` and the owner tapping, check that every bot gets
 *                 its cellMarked right after the draw (before the window closes), the standings after round 1 are
 *                 not all zero, and the owner's season activations in round 1 equal
 *                 the season cells drawn on the owner's card early enough for the
 *                 missed-number delay to pass before the round ended.
 * Depends on:     ./quicktest
 * Spec:           docs/spec/01-game-design.md §6; docs/spec/12-testing-strategy.md §3 inv. 17, 18
 */
import { describe, expect, it } from 'vitest';

import type { Card, DomainEvent } from '@sbr/domain';

import { runQuickTest } from './quicktest.js';

const result = runQuickTest({
  gameType: 'royale',
  playerCount: 20,
  ownerCards: 1,
  seedText: 'probe-1',
  tickedPrizes: [],
  markingMode: 'manual',
  // Draws every 4 s, speed window 3 s: a 3.5 s delay marks the owner's missed numbers
  // after the window has closed, so a mark on the draw (before the window closes) and a
  // delayed auto-mark are told apart by the speedWindowClosed event between them.
  drawIntervalMs: 4_000,
  missedNumbers: { kind: 'autoMarkAfter', delayMs: 3_500 },
});

// The events of the first round: from its roundStarted up to its roundEnded.
function firstRound(events: readonly DomainEvent[]): DomainEvent[] {
  const start = events.findIndex((e) => e.type === 'roundStarted');
  const end = events.findIndex((e) => e.type === 'roundEnded');
  return events.slice(start, end + 1);
}

const valueAt = (card: Card, cell: number): number | null => {
  const c = card.cells[cell];
  return c === undefined || c.kind === 'free' ? null : c.value;
};

describe('Quick Test in manual marking mode (01 §6)', () => {
  const round = firstRound(result.events);
  const started = round[0];
  const cards = started?.type === 'roundStarted' ? started.cardsByPlayer : {};
  const draws = round.flatMap((e) => (e.type === 'drawMade' ? [e.item] : []));

  it('marks every bot on the draw, before its speed window closes', () => {
    let item: number | null = null;
    let markedNow = new Set<string>();
    const check = (): void => {
      if (item === null) return;
      for (const [id, list] of Object.entries(cards)) {
        if (!id.startsWith('bot-')) continue;
        const hit = list[0]?.cells.some((c) => c.kind !== 'free' && c.value === item);
        expect(markedNow.has(id), `${id} on ${String(item)}`).toBe(hit === true);
      }
    };
    for (const e of round) {
      if (e.type === 'drawMade') {
        item = e.item;
        markedNow = new Set();
      } else if (e.type === 'speedWindowClosed') {
        check();
        item = null;
      } else if (e.type === 'cellMarked' && item !== null) {
        markedNow.add(e.accountId);
      }
    }
  });

  it('has standings that are not all zero after round 1', () => {
    const points = new Map<string, number>();
    for (const e of round) {
      if (e.type === 'cellMarked')
        points.set(e.accountId, (points.get(e.accountId) ?? 0) + e.markPoints);
    }
    const botPoints = [...points].filter(([id]) => id.startsWith('bot-')).map(([, p]) => p);
    expect(botPoints.some((p) => p > 0)).toBe(true);
  });

  it("activates the owner's seasons for the season cells drawn on the owner's card", () => {
    const card = cards['owner-01']?.[0];
    expect(card).toBeDefined();
    if (card === undefined) return;
    // The 3.5 s delay passes after the round ends (window close at 3 s) only for the
    // round's last draw, so that one can still be open when the round ends.
    const counted = draws.slice(0, -1);
    const drawnSeasonCells = (card.seasonCells ?? []).filter((cell) =>
      counted.includes(valueAt(card, cell) ?? -1),
    );
    const activations = round.filter(
      (e) => e.type === 'seasonActivated' && e.accountId === 'owner-01',
    );
    expect(drawnSeasonCells.length).toBeGreaterThan(0);
    expect(activations).toHaveLength(drawnSeasonCells.length);
  });
});
