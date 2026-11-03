/**
 * @file   packages/application/src/match/awaySummary.test.ts
 * @module application/match
 * @brief  "While you were away" from the event log since the player's last seen seq (01 §11).
 *
 * Responsibility: over a simulated asynchronous royale (8 players, automatic marking): nothing
 *                 new or a stranger gives no summary; a stretch of draws counts only its own
 *                 draws, the player's marks and the rank before and now; a stretch over the first cut tells survived or out; from the start
 *                 the whole match with the final place.
 * Depends on:     @sbr/contracts, @sbr/domain, ./awaySummary, ./rulesets
 * Spec:           docs/spec/01-game-design.md §11; docs/spec/06-realtime-architecture.md §6
 */
import { royaleAsyncDefault } from '@sbr/contracts';
import { simulateMatch, type DomainEvent } from '@sbr/domain';
import { describe, expect, it } from 'vitest';

import { buildAwaySummary } from './awaySummary.js';
import { toMatchRuleset } from './rulesets.js';

const { events: plain } = simulateMatch({
  matchId: 'm',
  seed: new Uint8Array(32).fill(3),
  gameType: 'royale',
  ruleset: toMatchRuleset(royaleAsyncDefault, 'auto', { kind: 'noAutoMark' }),
  playerCount: 8,
  tickedPrizes: [],
});
const events = plain.map((event, i) => ({ seq: i + 1, event }));
const ME = 'p003';

// The seq of the n-th event (1-based) of a type.
function seqOf(type: DomainEvent['type'], n = 1): number {
  const found = events.filter((e) => e.event.type === type)[n - 1];
  if (found === undefined) throw new Error(`no ${type} #${String(n)}`);
  return found.seq;
}

// A summary that must be there.
function summaryOf(stretch: typeof events, lastSeenSeq: number) {
  const s = buildAwaySummary({ events: stretch, lastSeenSeq, playerId: ME });
  if (s === null) throw new Error('no summary');
  return s;
}

describe('buildAwaySummary', () => {
  it('has nothing to tell when no event came since, or to a stranger', () => {
    expect(buildAwaySummary({ events, lastSeenSeq: events.length, playerId: ME })).toBeNull();
    expect(buildAwaySummary({ events, lastSeenSeq: 0, playerId: 'stranger' })).toBeNull();
  });

  it('counts the draws and own marks of the stretch, with the rank before and now', () => {
    const from = seqOf('drawMade', 10);
    const to = seqOf('drawMade', 20);
    const stretch = events.slice(0, to);
    const s = summaryOf(stretch, from);
    expect(s.draws).toBe(10);
    expect(s.fromSeq).toBe(from);
    expect(s.toSeq).toBe(to);
    const own = stretch.filter(
      (e) => e.seq > from && e.event.type === 'cellMarked' && e.event.accountId === ME,
    );
    expect(s.marks).toBe(own.length);
    expect(s.rankBefore).toBeGreaterThanOrEqual(1);
    expect(s.rankNow).toBeGreaterThanOrEqual(1);
    expect(s.playersIn).toBe(8);
    expect(s.pointsNow).toBeGreaterThanOrEqual(s.pointsBefore);
    expect(s.cutsSurvived).toBe(0);
    expect(s.finished).toBe(false);
  });

  it('tells whether the player survived the first cut or went out in it', () => {
    const cutSeq = seqOf('cutApplied');
    const cut = events[cutSeq - 1]?.event;
    if (cut?.type !== 'cutApplied') throw new Error('no cut');
    const s = summaryOf(events.slice(0, cutSeq), cutSeq - 1);
    expect(s.cutsSurvived).toBe(cut.survivors.includes(ME) ? 1 : 0);
    expect(s.eliminated).toBe(cut.eliminated.includes(ME));
    expect(s.playersIn).toBe(cut.survivors.length);
  });

  it('from the start tells the whole match and the final place', () => {
    const s = summaryOf(events, 0);
    const finished = plain.at(-1);
    if (finished?.type !== 'matchFinished') throw new Error('not finished');
    expect(s.draws).toBe(plain.filter((e) => e.type === 'drawMade').length);
    expect(s.finished).toBe(true);
    expect(s.finalPlace).toBe(finished.placement.find((p) => p.accountId === ME)?.place);
    expect(s.rankBefore).toBeNull();
  });
});
