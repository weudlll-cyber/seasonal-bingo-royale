/**
 * @file   packages/application/src/match/engine.test.ts
 * @module application/match
 * @brief  The live match engine with in-memory ports: the timed flow, host draws, D8, marks.
 *
 * Responsibility: a classic and a royale match with bots run from start to finish through
 *                 scheduled actions alone, every round ending only after its last window
 *                 closed (D10); host draws are refused in timed mode and while a window is
 *                 open; switching to timed draws schedules the next draw one interval after
 *                 the switch (D8); a tap inside the window earns the speed bonus, a later
 *                 tap does not (01 §6).
 * Depends on:     vitest, ./engine, ./fakes
 * Spec:           docs/spec/01-game-design.md §5–§7; docs/spec/06-realtime-architecture.md §4–§5
 */
import type { MissedNumbers } from '@sbr/domain';
import { describe, expect, it } from 'vitest';

import { MatchEngine, MatchError } from './engine.js';
import { ManualClock, MemoryScheduler, MemoryStore } from './fakes.js';

function setUp() {
  const store = new MemoryStore();
  const scheduler = new MemoryScheduler();
  const clock = new ManualClock();
  let n = 0;
  const engine = new MatchEngine({
    store,
    scheduler,
    bus: { publish: () => undefined, changed: () => undefined },
    clock,
    randomSeed: () => new Uint8Array(32).fill(7),
    randomCode: () => `CODE${String((n += 1))}`,
    betweenRoundsMs: 2_000,
  });
  return { store, scheduler, clock, engine };
}

const base = {
  title: 't',
  drawMode: 'auto' as const,
  missedNumbers: { kind: 'autoMarkAfter' as const, delayMs: 3_000 },
  maxPlayers: 20,
};

describe('timed flow', () => {
  it.each(['classic', 'royale'] as const)(
    'plays a %s match with bots to the finish',
    async (gameType) => {
      const { store, scheduler, clock, engine } = setUp();
      const m = await engine.create(
        { ...base, gameType, prizes: gameType === 'classic' ? ['fullCard'] : undefined },
        null,
      );
      await engine.join(m.id, 'person', true);
      await engine.fillWithBots(m.id, 20);
      await engine.start(m.id, 1_000);
      await scheduler.runUntil(engine, clock, Number.POSITIVE_INFINITY);
      const types = store.types(m.id);
      expect(types.at(-1)).toBe('matchFinished');
      expect(store.records.get(m.id)?.status).toBe('finished');
      // D10: every round end comes right after the window close of its last draw.
      types.forEach((t, i) => {
        if (t === 'roundEnded') expect(types[i - 1]).toBe('speedWindowClosed');
      });
    },
  );
});

async function runningHostMatch(missedNumbers: MissedNumbers = base.missedNumbers) {
  const ctx = setUp();
  const m = await ctx.engine.create(
    { ...base, gameType: 'classic', drawMode: 'host', missedNumbers },
    null,
  );
  await ctx.engine.join(m.id, 'person', true);
  await ctx.engine.fillWithBots(m.id, 5);
  await ctx.engine.start(m.id, 0);
  await ctx.scheduler.runUntil(ctx.engine, ctx.clock, ctx.clock.t);
  return { ...ctx, id: m.id };
}

describe('host draws and draw control (D8)', () => {
  it('draws on Draw next only after the previous window closed', async () => {
    const { engine, scheduler, clock, store, id } = await runningHostMatch();
    await engine.drawNext(id);
    await expect(engine.drawNext(id)).rejects.toEqual(new MatchError('DRAW_NOT_ALLOWED'));
    await scheduler.runUntil(engine, clock, clock.t + 3_000);
    await engine.drawNext(id);
    expect(store.types(id).filter((t) => t === 'drawMade')).toHaveLength(2);
  });

  it('refuses Draw next in timed mode, and resumes timed draws one interval after a switch', async () => {
    const { engine, scheduler, clock, id } = await runningHostMatch();
    const switchedAt = clock.t;
    const record = await engine.setDrawControl(id, 'auto', 5_000);
    expect(record.settings).toMatchObject({ drawMode: 'auto', drawIntervalMs: 5_000 });
    expect(scheduler.pending.find((a) => a.kind === 'draw')?.dueAt).toBe(switchedAt + 5_000);
    await expect(engine.drawNext(id)).rejects.toEqual(new MatchError('DRAW_MODE_AUTO'));
    await engine.setDrawControl(id, 'host');
    expect(scheduler.pending.some((a) => a.kind === 'draw')).toBe(false);
  });
});

// The person's cell holding the latest drawn number, or -1.
async function personCellOfLastDraw(engine: MatchEngine, id: string): Promise<number> {
  const round = (await engine.runner.current(id)).state.currentRound;
  const item = round?.draws.at(-1);
  const cells = round?.cards['person']?.[0]?.card.cells ?? [];
  return cells.findIndex((c) => c.kind !== 'free' && c.value === item);
}

// Draws until one of the person's numbers comes, taps it delayMs later, returns its points.
async function tapAfter(ctx: Awaited<ReturnType<typeof runningHostMatch>>, delayMs: number) {
  const { engine, scheduler, clock, store, id } = ctx;
  for (let i = 0; i < 40; i += 1) {
    await engine.drawNext(id);
    const cell = await personCellOfLastDraw(engine, id);
    clock.t += delayMs;
    if (cell >= 0 && (await engine.mark(id, 'person', 0, cell))) {
      const last = store.events.get(id)?.at(-1)?.event;
      return last?.type === 'cellMarked' ? last.markPoints : null;
    }
    await scheduler.runUntil(engine, clock, clock.t + 3_000);
  }
  return null;
}

describe('taps (01 §6)', () => {
  it('scores the speed bonus for a tap inside the window', async () => {
    expect(await tapAfter(await runningHostMatch(), 500)).toBeGreaterThan(10);
  });

  it('scores no bonus for a tap after the window', async () => {
    expect(await tapAfter(await runningHostMatch({ kind: 'noAutoMark' }), 4_000)).toBe(10);
  });
});
