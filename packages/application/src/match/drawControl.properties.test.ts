/**
 * @file   packages/application/src/match/drawControl.properties.test.ts
 * @module application/match
 * @brief  Invariant 16: switching draw mode or interval never changes the draw sequence.
 *
 * Responsibility: for random schedules of switches between timed and host draws and of
 *                 interval changes, at random moments of a classic match, every number
 *                 drawn is the next item of the round's sequence, and that sequence is the
 *                 one the match's seed and id determine (drawSequence), switches or not.
 * Depends on:     fast-check, ./fakes, @sbr/domain
 * Spec:           docs/spec/12-testing-strategy.md §3 invariant 16; docs/spec/01-game-design.md §5
 */
import { drawSequence, type DomainEvent } from '@sbr/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { fakeEngine } from './fakes.js';

type Step = { readonly to: 'stay' | 'host' | 'auto'; readonly intervalMs: number };

const stepArb: fc.Arbitrary<Step> = fc.record({
  to: fc.constantFrom('stay', 'host', 'auto'),
  intervalMs: fc.constantFrom(5_000, 6_000, 9_000),
});

// Each round's sequence, the one its seed and match id determine, and the numbers drawn.
function roundsOf(events: readonly DomainEvent[]) {
  const rounds: { sequence: readonly number[]; seeded: readonly number[]; drawn: number[] }[] = [];
  let seeded = (_round: number): readonly number[] => [];
  for (const e of events) {
    if (e.type === 'lobbyOpened') {
      const { seed, matchId, gameType } = e;
      seeded = (roundIndex) => drawSequence({ seed, matchId, roundIndex, gameType });
    } else if (e.type === 'roundStarted') {
      rounds.push({ sequence: e.drawSequence, seeded: seeded(e.roundIndex), drawn: [] });
    } else if (e.type === 'drawMade') rounds.at(-1)?.drawn.push(e.item);
  }
  return rounds;
}

// A classic match that follows the schedule, one step after another.
async function play(steps: readonly Step[]) {
  const kit = fakeEngine();
  const m = await kit.engine.create(
    {
      title: 't',
      gameType: 'classic',
      drawMode: 'auto',
      missedNumbers: { kind: 'autoMarkAfter', delayMs: 3_000 },
      maxPlayers: 10,
    },
    null,
  );
  await kit.engine.fillWithBots(m.id, 5);
  await kit.engine.start(m.id, 0);
  // The start is a scheduled action: run it, so the match is running before the first step.
  await kit.scheduler.runUntil(kit.engine, kit.clock, kit.clock.t);
  let mode: 'auto' | 'host' = 'auto';
  for (const step of steps) {
    if ((await kit.engine.runner.current(m.id)).record.status !== 'running') break;
    if (step.to !== 'stay') {
      mode = (await kit.engine.setDrawControl(m.id, step.to, step.intervalMs)).settings.drawMode;
    }
    await kit.scheduler.runUntil(kit.engine, kit.clock, kit.clock.t + 10_000);
    // A refused Draw next (round over, too early) leaves the sequence alone too.
    if (mode === 'host') await kit.engine.drawNext(m.id).catch(() => undefined);
  }
  return roundsOf((kit.store.events.get(m.id) ?? []).map((s) => s.event));
}

describe('draw control invariant 16', () => {
  it('draws the committed sequence whatever the switches', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(stepArb, { minLength: 5, maxLength: 30 }), async (steps) => {
        const rounds = await play(steps);
        for (const round of rounds) {
          expect(round.sequence).toEqual(round.seeded);
          expect(round.drawn).toEqual(round.sequence.slice(0, round.drawn.length));
        }
        expect(rounds[0]?.drawn.length).toBeGreaterThan(0);
      }),
      // Each run plays part of a match; 30 cover the switch points well and stay fast.
      { numRuns: 30 },
    );
  }, 60_000);
});
