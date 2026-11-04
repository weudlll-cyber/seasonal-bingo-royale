/**
 * @file   apps/server/src/view/stepFrames.test.ts
 * @module server/view
 * @brief  The room frame leaves out the summary and the standings order only when unchanged (06 §8).
 *
 * Responsibility: the first step carries both; a step whose summary and standings order equal
 *                 what the room last got leaves both out and a screen keeps what it holds
 *                 (@sbr/contracts applyStep); a step where only one of them changed carries
 *                 that one, and the screen takes it — a part dropped while it changed fails here.
 * Depends on:     vitest, @sbr/contracts, ./stepFrames
 * Spec:           docs/spec/06-realtime-architecture.md §8
 */
import { applyStep, type LiveHeld, type LiveOwnFrame, type LiveStepFrame } from '@sbr/contracts';
import { describe, expect, it } from 'vitest';

import { leaveOutUnchanged } from './stepFrames.js';

type Summary = { readonly youHost: boolean | null; readonly players: number };

// A room frame of one draw after seq `since`, with the given summary and standings order.
function frame(since: number, players: number, rankedIn: string[]): LiveStepFrame<Summary> {
  return {
    s: since + 1,
    since,
    events: [{ s: since + 1, at: 0, event: { type: 'drawMade', item: 7 } as never }],
    match: { youHost: null, players },
    view: { rankedIn, recaps: null },
  };
}

// A spectator's screen holding seq 1 with this summary and standings order.
function screen(players: number, rankedIn: string[]): LiveHeld<Summary> {
  const view = { events: [], players: [], ownerStatus: {}, recaps: [], rankedIn };
  return { match: { youHost: true, players }, seq: 1, me: null, view } as never;
}

const own = (s: number): LiveOwnFrame => ({ s, me: null, watch: null });

describe('the parts a room frame leaves out when unchanged (06 §8)', () => {
  it('carries both in the first step', () => {
    const { frame: f } = leaveOutUnchanged(frame(0, 3, ['a', 'b']), undefined);
    expect(f.match).toEqual({ youHost: null, players: 3 });
    expect(f.view.rankedIn).toEqual(['a', 'b']);
  });

  it('leaves both out when unchanged, and the screen keeps what it holds', () => {
    const first = leaveOutUnchanged(frame(0, 3, ['a', 'b']), undefined);
    const { frame: f } = leaveOutUnchanged(frame(1, 3, ['a', 'b']), first.sent);
    expect('match' in f).toBe(false);
    expect('rankedIn' in f.view).toBe(false);
    const held = applyStep(screen(3, ['a', 'b']), f, own(2));
    expect(held?.match).toEqual({ youHost: true, players: 3 });
    expect(held?.view.rankedIn).toEqual(['a', 'b']);
  });

  it('carries the part that changed, and the screen takes it', () => {
    const first = leaveOutUnchanged(frame(0, 3, ['a', 'b']), undefined);
    const ranked = leaveOutUnchanged(frame(1, 3, ['b', 'a']), first.sent).frame;
    expect('match' in ranked).toBe(false);
    const held = applyStep(screen(3, ['a', 'b']), ranked, own(2));
    expect(held?.view.rankedIn).toEqual(['b', 'a']);
    const joined = leaveOutUnchanged(frame(1, 4, ['a', 'b']), first.sent).frame;
    expect('rankedIn' in joined.view).toBe(false);
    const after = applyStep(screen(3, ['a', 'b']), joined, own(2));
    expect(after?.match).toEqual({ youHost: true, players: 4 });
  });
});
