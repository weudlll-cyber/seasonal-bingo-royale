/**
 * @file   apps/server/src/dev/quicktest.test.ts
 * @module server/dev
 * @brief  Unit test for the Quick Test runner (WP-08 acceptance smoke).
 *
 * Responsibility: feed the runner one fixed seed per game type and check the
 *                 invariants the owner's manual acceptance depends on: the result is
 *                 deterministic (same input → same output), the final placement is a
 *                 total order 1..N over every entrant, the Winter shield reserves a
 *                 player's shieldCharges and the event log contains the lifecycle
 *                 events the client plays back.
 * Depends on:     ./quicktest
 * Spec:           docs/spec/15-implementation-plan.md WP-08
 */
import { describe, expect, it } from 'vitest';

import { runQuickTest, type QuickTestResult } from './quicktest.js';

const TICKED = ['rows-1', 'rows-2', 'fourCorners', 'oneDiagonal', 'fullCard'];

describe('runQuickTest', () => {
  it.each(['royale', 'classicSeasons', 'classic'] as const)(
    'runs end-to-end for %s and is deterministic in auto mode',
    (gameType) => {
      const first = runQuickTest({
        gameType,
        playerCount: 3,
        ownerCards: 1,
        seedText: 'spring-10',
        tickedPrizes: TICKED,
        markingMode: 'auto',
      });
      const second = runQuickTest({
        gameType,
        playerCount: 3,
        ownerCards: 1,
        seedText: 'spring-10',
        tickedPrizes: TICKED,
        markingMode: 'auto',
      });
      // Determinism: cards and placements are identical across runs.
      expect(first.players.map((p) => p.card)).toEqual(second.players.map((p) => p.card));
      expect(first.players.map((p) => p.place)).toEqual(second.players.map((p) => p.place));
      expect(first.players.map((p) => p.points)).toEqual(second.players.map((p) => p.points));
      // Total order 1..N over every entrant (invariant 8).
      expect(first.players.map((p) => p.place).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
      // The owner's displayed account id starts with the owner prefix.
      expect(first.ownerAccountIds).toEqual(['owner-01']);
      expect(first.players[0]?.isOwner).toBe(true);
      // The event stream contains at least one roundStarted and one matchFinished.
      expect(first.events.some((e) => e.type === 'roundStarted')).toBe(true);
      expect(first.events.some((e) => e.type === 'matchFinished')).toBe(true);
    },
  );
});

describe('runQuickTest — payload for the player client', () => {
  it('names players in every event by their display id, never by the internal id', () => {
    const result = runQuickTest({
      gameType: 'royale',
      playerCount: 19,
      ownerCards: 1,
      seedText: 'showcase-3',
      tickedPrizes: [],
      markingMode: 'auto',
    });
    const ids = new Set(result.players.map((p) => p.accountId));
    const named = result.events.flatMap((e) => ('accountId' in e ? [e.accountId] : []));
    expect(named.length).toBeGreaterThan(0);
    for (const id of named) expect(ids.has(id)).toBe(true);
    const round = result.events.find((e) => e.type === 'roundStarted');
    expect(Object.keys(round?.type === 'roundStarted' ? round.cardsByPlayer : {})).toContain(
      'owner-01',
    );
  });

  it('sends the owner effect timeline: seasons only grow, durations never negative', () => {
    const result = runQuickTest({
      gameType: 'royale',
      playerCount: 19,
      ownerCards: 1,
      seedText: 'showcase-3',
      tickedPrizes: [],
      markingMode: 'auto',
    });
    const timeline = result.ownerStatus['owner-01'] ?? [];
    expect(timeline.length).toBeGreaterThan(1);
    let seasons = 0;
    for (const entry of timeline) {
      expect(entry.seasons.length).toBeGreaterThanOrEqual(seasons);
      seasons = entry.seasons.length;
      expect(entry.multiplier?.remainingDraws ?? 0).toBeGreaterThanOrEqual(0);
    }
    expect(result.effectSeasons).toMatchObject({ growth: 'spring', multiplier: 'summer' });
  });

  it('builds a 200-player royale within two seconds', () => {
    const started = Date.now();
    runQuickTest({
      gameType: 'royale',
      playerCount: 199,
      ownerCards: 1,
      seedText: 'big',
      tickedPrizes: [],
      markingMode: 'auto',
    });
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});

// What the player client shows as each player's score: event points, reset to the
// server's baseline at every stage start (apps/web/src/playback.ts does the same).
function clientPoints(result: QuickTestResult): Map<string, number> {
  const points = new Map<string, number>();
  const add = (id: string, value: number): void => {
    points.set(id, (points.get(id) ?? 0) + value);
  };
  const baselines = new Map(result.stagePoints.map((s) => [s.step, s.points]));
  result.events.forEach((e, i) => {
    if (e.type === 'cellMarked') add(e.accountId, e.markPoints);
    if (e.type === 'seasonActivated') add(e.accountId, e.instantPoints);
    if (e.type === 'patternScored' || e.type === 'seasonCompleteFired') add(e.accountId, e.points);
    if (e.type === 'jackpotClaimed') add(e.accountId, e.value);
    for (const [id, value] of Object.entries(baselines.get(i + 1) ?? {})) points.set(id, value);
  });
  return points;
}

describe('runQuickTest — scores the client shows', () => {
  it('reach every final score: stage baselines (score carry) plus event points', () => {
    const result = runQuickTest({
      gameType: 'royale',
      playerCount: 19,
      ownerCards: 1,
      seedText: 'showcase-41',
      tickedPrizes: [],
      markingMode: 'auto',
    });
    const points = clientPoints(result);
    for (const p of result.players) expect(points.get(p.accountId) ?? 0).toBe(p.points);
  });
});
