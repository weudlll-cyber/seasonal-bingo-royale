/**
 * @file   apps/web/src/quickTestFixture.ts
 * @module web
 * @brief  A tiny hand-made Quick Test result for the client's unit and component tests.
 *
 * Responsibility: a two-round royale with one owner (owner-01) and two bots: round 1
 *                 marks a season cell, a cut eliminates the owner, round 2 deals new
 *                 cards to the survivors only. Small enough to reason about in a test.
 * Depends on:     ./types
 * Used by:        ./playback.test.ts, ./components/*.test.tsx
 * Spec:           docs/spec/15-implementation-plan.md WP-08
 */
import type { Card, MissedNumbers, OwnerStatus, QuickTestResult } from './types.js';

// Numbers 1..24 around a free centre; season cells at 0 (spring), 6 (summer),
// 18 (autumn), 24 (winter): four different rows and columns.
export function numberCard(offset: number, seasons = true): Card {
  return {
    cells: Array.from({ length: 25 }, (_v, i) =>
      i === 12
        ? { kind: 'free' as const }
        : { kind: 'number' as const, value: offset + (i < 12 ? i + 1 : i) },
    ),
    seasonCells: seasons ? [0, 6, 18, 24] : null,
  };
}

const STATUS: OwnerStatus[] = [
  { step: 0, multiplier: null, growth: null, shieldCharges: 0, seasons: [] },
  {
    step: 6,
    multiplier: null,
    growth: { pointsPerMark: 2, remainingDraws: 10 },
    shieldCharges: 0,
    seasons: ['spring'],
  },
];

export function royaleFixture(
  markingMode: 'auto' | 'manual' = 'auto',
  missedNumbers: MissedNumbers = { kind: 'autoMarkAfter', delayMs: 3000 },
): QuickTestResult {
  const player = (accountId: string, isOwner: boolean, place: number, points = 0) => ({
    accountId,
    isOwner,
    card: numberCard(0),
    place,
    points,
    seasonsActivated: 0,
    shieldCharges: 0,
  });
  return {
    gameType: 'royale',
    markingMode,
    missedNumbers,
    ownerAutoMarkDelayMs: missedNumbers.kind === 'autoMarkAfter' ? missedNumbers.delayMs : 3000,
    drawIntervalMs: 1000,
    drawIntervalRangeMs: { min: 500, max: 60_000 },
    // Shorter than the 1 s draw interval, as every ruleset requires (D10).
    speedWindowMs: 500,
    pointsPerMark: 10,
    maxSpeedBonus: 10,
    tickedPrizes: [],
    stagePlan: [
      { kind: 'qualification', rounds: 1 },
      { kind: 'final', rounds: 1 },
    ],
    ownerAccountIds: ['owner-01'],
    ownerStatus: { 'owner-01': STATUS },
    // The final stage resets the survivors' points (score carry `reset`); owner-01, out
    // after the cut, keeps the 10 points it had when eliminated.
    stagePoints: [
      { step: 1, points: { 'owner-01': 0, 'bot-02': 0, 'bot-03': 0 } },
      { step: 12, points: { 'owner-01': 10, 'bot-02': 0, 'bot-03': 0 } },
    ],
    effectSeasons: { growth: 'spring', multiplier: 'summer', harvest: 'autumn', shield: 'winter' },
    players: [
      player('owner-01', true, 3, 10),
      player('bot-02', false, 1),
      player('bot-03', false, 2),
    ],
    events: royaleEvents(),
  };
}

function royaleEvents(): QuickTestResult['events'] {
  const r1 = { 'owner-01': [numberCard(0)], 'bot-02': [numberCard(1)], 'bot-03': [numberCard(2)] };
  const r2 = { 'bot-02': [numberCard(3)], 'bot-03': [numberCard(4)] };
  return [
    { type: 'stageStarted', stageIndex: 0 },
    {
      type: 'roundStarted',
      roundIndex: 0,
      stageIndex: 0,
      roundInStage: 0,
      drawSequence: [1, 2],
      cardsByPlayer: r1,
    },
    { type: 'drawMade', drawIndex: 0, item: 1 },
    { type: 'cellMarked', accountId: 'owner-01', cardIndex: 0, cellIndex: 0, markPoints: 10 },
    { type: 'seasonActivated', accountId: 'owner-01', season: 'spring', instantPoints: 0 },
    { type: 'speedWindowClosed', drawIndex: 0 },
    { type: 'drawMade', drawIndex: 1, item: 2 },
    { type: 'cellMarked', accountId: 'bot-02', cardIndex: 0, cellIndex: 0, markPoints: 30 },
    { type: 'speedWindowClosed', drawIndex: 1 },
    { type: 'roundEnded', roundIndex: 0, reason: 'drawCount' },
    {
      type: 'cutApplied',
      stageIndex: 0,
      survivors: ['bot-02', 'bot-03'],
      eliminated: ['owner-01'],
      shieldSaves: [],
    },
    { type: 'stageStarted', stageIndex: 1 },
    {
      type: 'roundStarted',
      roundIndex: 1,
      stageIndex: 1,
      roundInStage: 0,
      drawSequence: [4],
      cardsByPlayer: r2,
    },
    { type: 'drawMade', drawIndex: 0, item: 4 },
    { type: 'speedWindowClosed', drawIndex: 0 },
    { type: 'roundEnded', roundIndex: 1, reason: 'firstFullHouse' },
    { type: 'matchFinished', placement: [] },
  ];
}
